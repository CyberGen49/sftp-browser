
const path = require('path');
const express = require('express');
const expressWs = require('express-ws');
const asyncHandler = require('express-async-handler');
const logger = require('cyber-express-logger');
const sftp = require('ssh2-sftp-client');
const crypto = require('crypto');
const mime = require('mime');
const bodyParser = require('body-parser');
const archiver = require('archiver');
const rawBodyParser = bodyParser.raw({
    limit: '16mb',
    type: '*/*'
});
const dayjs = require('dayjs');
const dayjsAdvancedFormat = require('dayjs/plugin/advancedFormat');
dayjs.extend(dayjsAdvancedFormat);
const utils = require('web-resources');
const Electron = require('electron');
const config = require('./config.json');

const normalizeRemotePath = remotePath => {
    remotePath = path.normalize(remotePath).replace(/\\/g, '/');
    const split = remotePath.split('/').filter(String);
    const joined = `/${split.join('/')}`;
    return joined;
};

const sessions = {};
const sessionActivity = {};

const getObjectHash = obj => {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(obj));
    return hash.digest('hex');
}

/**
 * @param {sftp.ConnectOptions} opts
 * @returns {Promise<sftp>|null}
 * */
const getSession = async(res, opts) => {
    const hash = getObjectHash(opts);
    const address = `${opts.username}@${opts.host}:${opts.port}`;
    if (sessions[hash]) {
        console.log(`Using existing connection to ${address}`);
        sessionActivity[hash] = Date.now();
        return sessions[hash];
    }
    console.log(`Creating new connection to ${address}`);
    const session = new sftp();
    sessions[hash] = session;
    session.on('end', () => delete sessions[hash]);
    session.on('close', () => delete sessions[hash]);
    try {
        await session.connect(opts);
        sessionActivity[hash] = Date.now();
    } catch (error) {
        delete sessions[hash];
        console.log(`Connection to ${address} failed`);
        return res ? res.sendError(error) : null;
    }
    return session;
};

const srv = express();
expressWs(srv, undefined, {
    wsOptions: {
        maxPayload: 1024*1024*4
    }
});
srv.use(logger());
const staticDir = path.join(__dirname, 'web');
srv.use(express.static(staticDir));
console.log(`Serving static files from ${staticDir}`);

const initApi = asyncHandler(async(req, res, next) => {
    res.sendData = (status = 200) => res.status(status).json(res.data);
    res.sendError = (error, status = 400) => {
        res.data.success = false;
        res.data.error = `${error}`.replace('Error: ', '');
        res.sendData(status);
    }
    res.data = {
        success: true
    };
    req.connectionOpts = {
        host: req.headers['sftp-host'],
        port: req.headers['sftp-port'] || 22,
        username: req.headers['sftp-username'],
        password: decodeURIComponent(req.headers['sftp-password'] || '') || undefined,
        privateKey: decodeURIComponent(req.headers['sftp-key'] || '') || undefined,
    };
    if (!req.connectionOpts.host)
        return res.sendError('Missing host header');
    if (!req.connectionOpts.username)
        return res.sendError('Missing username header');
    if (!req.connectionOpts.password && !req.connectionOpts.privateKey)
        return res.sendError('Missing password or key header');
    req.session = await getSession(res, req.connectionOpts);
    if (!req.session) return;
    next();
});
srv.get('/api/sftp/directories/list', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    res.data.includesFiles = req.query.dirsOnly === 'true' ? false : true;
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        res.data.list = await session.list(res.data.path);
        if (res.data.list && !res.data.includesFiles) {
            res.data.list = res.data.list.filter(item => item.type === 'd');
        }
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.post('/api/sftp/directories/create', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        await session.mkdir(res.data.path);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.delete('/api/sftp/directories/delete', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        await session.rmdir(res.data.path, true);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.get('/api/sftp/files/exists', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        const type = await session.exists(res.data.path);
        res.data.exists = type !== false;
        res.data.type = type;
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.post('/api/sftp/files/create', initApi, rawBodyParser, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        await session.put(req.body, res.data.path);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.put('/api/sftp/files/append', initApi, rawBodyParser, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        await session.append(req.body, res.data.path);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
const keyedRequests = {};
srv.get('/api/sftp/key', initApi, async(req, res) => {
    res.data.key = utils.randomHex(32);
    keyedRequests[res.data.key] = req;
    res.sendData();
});
srv.ws('/api/sftp/files/append', async(ws, wsReq) => {
    if (!wsReq.query.key) return ws.close();
    const req = keyedRequests[wsReq.query.key];
    if (!req) return ws.close();
    // Add uniqueness to the connection opts
    // This forces a new connection to be created
    req.connectionOpts.ts = Date.now();
    // Create the session and throw an error if it fails
    /** @type {sftp} */
    const session = await getSession(null, req.connectionOpts);
    const sessionHash = getObjectHash(req.connectionOpts);
    if (!session) {
        ws.send(JSON.stringify({
            success: false,
            error: 'Failed to create session!'
        }));
        return ws.close();
    }
    // Normalize the file path or throw an error if it's missing
    const filePath = normalizeRemotePath(wsReq.query.path);
    if (!filePath) {
        ws.send(JSON.stringify({
            success: false,
            error: 'Missing path'
        }));
        return ws.close();
    }
    // Handle websocket closure
    ws.on('close', () => {
        console.log(`File append websocket closed`);
        session.end();
        delete sessionActivity[sessionHash];
    });
    // Listen for messages
    console.log(`Websocket opened to append to ${req.connectionOpts.username}@${req.connectionOpts.host}:${req.connectionOpts.port} ${filePath}`);
    let isWriting = false;
    ws.on('message', async(data) => {
        // If we're already writing, send an error
        if (isWriting) {
            return ws.send(JSON.stringify({
                success: false,
                error: 'Writing in progress'
            }));
        }
        try {
            // Append the data to the file
            isWriting = true;
            await session.append(data, filePath);
            ws.send(JSON.stringify({ success: true }));
        } catch (error) {
            ws.send(JSON.stringify({
                success: false,
                error: error.toString()
            }));
            return ws.close();
        }
        isWriting = false;
        // Update the session activity
        sessionActivity[sessionHash] = Date.now();
    });
    // Send a ready message
    ws.send(JSON.stringify({ success: true, status: 'ready' }));
});
srv.delete('/api/sftp/files/delete', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    try {
        await session.delete(res.data.path);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.put('/api/sftp/files/move', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.pathOld = normalizeRemotePath(req.query.pathOld);
    res.data.pathNew = normalizeRemotePath(req.query.pathNew);
    if (!res.data.pathOld) return res.sendError('Missing source path', 400);
    if (!res.data.pathNew) return res.sendError('Missing destination path', 400);
    try {
        await session.rename(res.data.pathOld, res.data.pathNew);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.put('/api/sftp/files/copy', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.pathSrc = normalizeRemotePath(req.query.pathSrc);
    res.data.pathDest = normalizeRemotePath(req.query.pathDest);
    if (!res.data.pathSrc) return res.sendError('Missing source path', 400);
    if (!res.data.pathDest) return res.sendError('Missing destination path', 400);
    try {
        await session.rcopy(res.data.pathSrc, res.data.pathDest);
        res.sendData();
    } catch (error) {
        res.sendError(error);
    }
});
srv.get('/api/sftp/files/stat', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    let stats = null;
    try {
        stats = await session.stat(res.data.path);
    } catch (error) {
        return res.sendError(error, 404);
    }
    res.data.stats = stats;
    res.sendData();
});
const downloadSingleFileHandler = async(connectionOpts, res, remotePath, stats) => {
    let interval;
    // Gracefully handle any errors
    try {
        // Throw an error if it's not a file
        if (!stats.isFile) throw new Error('Not a file');
        // Add uniqueness to the connection opts
        // This forces a new connection to be created
        connectionOpts.ts = Date.now();
        // Create the session and throw an error if it fails
        const session = await getSession(res, connectionOpts);
        if (!session) throw new Error('Failed to create session');
        // Continuously update the session activity
        setInterval(() => {
            const hash = getObjectHash(connectionOpts);
            sessionActivity[hash] = Date.now();
        }, 1000*1);
        // When the response closes, end the session
        res.on('close', () => {
            clearInterval(interval);
            session.end();
        });
        // Set response headers
        res.setHeader('Content-Type', mime.getType(remotePath) || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(remotePath)}"`);
        res.setHeader('Content-Length', stats.size);
        // Start the download
        console.log(`Starting download: ${connectionOpts.username}@${connectionOpts.host}:${connectionOpts.port} ${remotePath}`);
        await session.get(remotePath, res);
        // Force-end the response
        res.end();
    // On error, clear the interval and send a 400 response
    } catch (error) {
        clearInterval(interval);
        res.status(400).end();
    }
};
const downloadMultiFileHandler = async(connectionOpts, res, remotePaths, rootPath = '/') => {
    rootPath = normalizeRemotePath(rootPath);
    let interval;
    // Gracefully handle any errors
    try {
        // Add uniqueness to the connection opts
        // This forces a new connection to be created
        connectionOpts.ts = Date.now();
        // Create the session and throw an error if it fails
        const session = await getSession(res, connectionOpts);
        if (!session) throw new Error('Failed to create session');
        // Continuously update the session activity
        setInterval(() => {
            const hash = getObjectHash(connectionOpts);
            sessionActivity[hash] = Date.now();
        }, 1000*1);
        // Set response headers
        let fileName = `Files (${path.basename(rootPath) || 'Root'})`;
        if (remotePaths.length == 1)
            fileName = path.basename(remotePaths[0]);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}.zip"`);
        // Create the archive and start piping to the response
        const archive = archiver('zip');
        archive.pipe(res);
        // When the response closes, end the session
        res.on('close', () => {
            clearInterval(interval);
            archive.end();
            session.end();
        });
        // Add file to the archive
        const addToArchive = async(remotePath) => {
            const archivePath = normalizeRemotePath(remotePath.replace(rootPath, ''));
            console.log(`Zipping: ${connectionOpts.username}@${connectionOpts.host}:${connectionOpts.port} ${remotePath}`);
            // Get file read stream
            const stream = session.createReadStream(remotePath);
            const waitToEnd = new Promise(resolve => {
                stream.on('end', resolve);
            });
            // Add file to archive
            archive.append(stream, {
                name: archivePath
            });
            // Wait for the stream to end
            await waitToEnd;
        };
        // Recurse through directories and archive files
        const recurse = async(remotePath) => {
            try {
                const stats = await session.stat(remotePath);
                if (stats.isFile) {
                    await addToArchive(remotePath);
                } else if (stats.isDirectory) {
                    const list = await session.list(remotePath);
                    for (const item of list) {
                        const subPath = `${remotePath}/${item.name}`;
                        if (item.type === '-') {
                            await addToArchive(subPath);
                        } else {
                            await recurse(subPath);
                        }
                    }
                }
            } catch (error) {}
        };
        for (const remotePath of remotePaths) {
            await recurse(remotePath);
        }
        // Finalize the archive
        archive.on('close', () => res.end());
        archive.finalize();
    // On error, clear the interval and send a 400 response
    } catch (error) {
        clearInterval(interval);
        res.status(400).end();
    }
};
srv.get('/api/sftp/files/get/single', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    // Get the normalized path and throw an error if it's missing
    const remotePath = normalizeRemotePath(req.query.path);
    if (!remotePath) return res.sendError('Missing path', 400);
    try {
        const stats = await session.stat(remotePath);
        // Handle the download
        await downloadSingleFileHandler(req.connectionOpts, res, remotePath, stats);
    } catch (error) {
        res.status(400).end();
    }
});
const rawDownloads = {};
srv.get('/api/sftp/files/get/single/url', initApi, async(req, res) => {
    /** @type {sftp} */
    const session = req.session;
    // Get the normalized path and throw an error if it's missing
    res.data.path = normalizeRemotePath(req.query.path);
    if (!res.data.path) return res.sendError('Missing path', 400);
    // Get path stats and throw an error if it's not a file
    let stats = null;
    try {
        stats = await session.stat(res.data.path);
        if (!stats?.isFile) throw new Error('Not a file');
    } catch (error) {
        return res.sendError(error);
    }
    // Generate download URL
    const id = utils.randomHex(8);
    res.data.download_url = `https://${req.get('host')}/dl/${id}`;
    // Create download handler
    rawDownloads[id] = {
        created: Date.now(),
        paths: [ res.data.path ],
        handler: async(req2, res2) => {
            // Handle the download
            await downloadSingleFileHandler(req.connectionOpts, res2, res.data.path, stats);
        }
    }
    res.sendData();
});
srv.get('/api/sftp/files/get/multi/url', initApi, async(req, res) => {
    try {
        // Get the normalized path and throw an error if it's missing
        res.data.paths = JSON.parse(req.query.paths);
        if (!res.data.paths) throw new Error('Missing path(s)');
    } catch (error) {
        return res.sendError(error);
    }
    // Generate download URL
    const id = utils.randomHex(8);
    res.data.download_url = `https://${req.get('host')}/dl/${id}`;
    // Create download handler
    rawDownloads[id] = {
        created: Date.now(),
        paths: res.data.paths,
        isZip: true,
        handler: async(req2, res2) => {
            // Handle the download
            await downloadMultiFileHandler(req.connectionOpts, res2, res.data.paths, req.query.rootPath);
        }
    }
    res.sendData();
});
srv.get('/dl/:id', async(req, res) => {
    // Get the download handler
    const entry = rawDownloads[req.params.id];
    if (!entry) return res.status(404).end();
    // If the user agent looks like a bot
    if (req.get('user-agent').match(/(bot|scrape)/)) {
        // Send some HTML
        res.setHeader('Content-Type', 'text/html');
        const html = /*html*/`
            <html>
                <head>
                    <title>Download shared files</title>
                    <meta property="og:site_name" content="SFTP Browser" />
                    <meta property="og:title" content="Shared ${entry.isZip ? 'files':'file'}" />
                    <meta property="og:description" content="Click to download ${entry.isZip ? `these files compressed into a zip.`:`${path.basename(entry.paths[0])}.`} This link will expire on ${dayjs(entry.created+(1000*60*60*24)).format('YYYY-MM-DD [at] hh:mm:ss ([GMT]Z)')}." />
                    <meta name="theme-color" content="#1f2733">
                    <meta property="og:image" content="https://${req.get('host')}/icon.png" />
                </head>
                <body>
                    <p>Click <a href="${req.originalUrl}">here</a> to download the file.</p>
                </body>
            </html>
        `;
        res.send(html);
    } else {
        entry.handler(req, res);
    }
});

srv.use((req, res) => res.status(404).end());

setInterval(() => {
    // Delete inactive sessions
    for (const hash in sessions) {
        const lastActive = sessionActivity[hash];
        if (!lastActive) continue;
        if ((Date.now()-lastActive) > 1000*60*5) {
            console.log(`Deleting inactive session`);
            sessions[hash].end();
            delete sessions[hash];
            delete sessionActivity[hash];
        }
    }
    // Delete unused downloads
    for (const id in rawDownloads) {
        const download = rawDownloads[id];
        if ((Date.now()-download.created) > 1000*60*60*12) {
            console.log(`Deleting unused download`);
            delete rawDownloads[id];
        }
    }
}, 1000*30);

if (Electron.app) {
    Electron.app.whenReady().then(async() => {
        // Start the server
        let port = 8001+Math.floor(Math.random()*999);
        await new Promise(resolve => {
            srv.listen(port, () => {
                console.log(`App server listening on port ${port}`)
                resolve();
            });
        });
        // Open the window
        const window = new Electron.BrowserWindow({
            width: 1100,
            height: 720,
            autoHideMenuBar: true,
            minWidth: 320,
            minHeight: 200
        });
        window.loadURL(`http://localhost:${port}`);
      	// Quit the app when all windows are closed
      	// unless we're on macOS
        Electron.app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') Electron.app.quit();
        });
    });
} else {
    srv.listen(config.port, () => console.log(`Standalone server listening on port ${config.port}`));
}