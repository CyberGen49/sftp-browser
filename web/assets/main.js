
const elProgressBar = $('#progressBar');
const elStatusBar = $('#statusBar');
const isElectron = window && window.process && window.process.type;
/** 
 * The hostname of the API
 * @type {string}
 */
let apiHost = window.localStorage.getItem('apiHost') || window.location.host;
let isLocalhost = window.location.hostname == 'localhost';
let httpProtocol = isLocalhost ? 'http' : 'https';
let wsProtocol = httpProtocol == 'http' ? 'ws' : 'wss';
/** An object of saved connection information */
let connections = JSON.parse(window.localStorage.getItem('connections')) || {};
/** The current active connection */
let activeConnection = null;
/** The ID of the current active connection */
let activeConnectionId = null;

/**
 * Checks if two HTML elements overlap
 * @param {HTMLElement} el1 The first element
 * @param {HTMLElement} el2 The second element
 * @returns {boolean} True if the elements overlap, false otherwise
 */
function checkDoElementsOverlap(el1, el2) {
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();

    const overlap = !(rect1.right < rect2.left || 
                    rect1.left > rect2.right || 
                    rect1.bottom < rect2.top || 
                    rect1.top > rect2.bottom);

    return overlap;
}

const downloadUrl = (url, name) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name || '';
    a.click();
}

const getFileExtInfo = (path, size) => {
    const ext = path.split('.').pop().toLowerCase();
    const types = {
        image: {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            svg: 'image/svg',
            webp: 'image/webp'
        },
        video: {
            mp4: 'video/mp4',
            webm: 'video/webm',
            ogv: 'video/ogg'
        },
        audio: {
            mp3: 'audio/mpeg',
            wav: 'audio/wav'
        },
        text: {
            txt: 'text/plain',
            html: 'text/html',
            css: 'text/css',
            js: 'text/javascript',
            json: 'application/json',
            py: 'text/x-python',
            php: 'text/x-php',
            java: 'text/x-java-source',
            c: 'text/x-c',
            cpp: 'text/x-c++',
            cs: 'text/x-csharp',
            rb: 'text/x-ruby',
            go: 'text/x-go',
            rs: 'text/x-rust',
            swift: 'text/x-swift',
            sh: 'text/x-shellscript',
            bat: 'text/x-batch',
            ps1: 'text/x-powershell',
            sql: 'text/x-sql',
            yaml: 'text/yaml',
            yml: 'text/yaml',
            ts: 'text/typescript',
            properties: 'text/x-properties',
            toml: 'text/x-toml',
            cfg: 'text/x-properties',
            conf: 'text/x-properties',
            ini: 'text/x-properties',
            log: 'text/x-log'
        },
        markdown: {
            md: 'text/markdown',
            markdown: 'text/markdown'
        }
    };
    // https://codemirror.net/5/mode/index.html
    // https://github.com/codemirror/codemirror5/tree/master/mode
    const getKeywordsObject = keywords => {
        const obj = {};
        for (const word of keywords) obj[word] = true;
        return obj;
    }
    const codeMirrorModes = {
        html: 'htmlmixed',
        css: 'css',
        js: 'javascript',
        json: {
            name: 'javascript',
            json: true
        },
        py: 'python',
        php: 'php',
        java: {
            name: 'clike',
            keywords: getKeywordsObject('abstract assert boolean break byte case catch char class const continue default do double else enum exports extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while'.split(' '))
        },
        c: {
            name: 'clike',
            keywords: getKeywordsObject('auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while'.split(' '))
        },
        cpp: {
            name: 'clike',
            keywords: getKeywordsObject('asm auto break case catch char class const const_cast continue default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new operator private protected public register reinterpret_cast return short signed sizeof static static_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while'.split(' ')),
            useCPP: true
        },
        cs: {
            name: 'clike',
            keywords: getKeywordsObject('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while'.split(' ')),
        },
        rb: 'ruby',
        go: 'go',
        rs: 'rust',
        swift: 'swift',
        sh: 'shell',
        ps1: 'powershell',
        sql: 'sql',
        yaml: 'yaml',
        yml: 'yaml',
        ts: 'javascript',
        properties: 'properties',
        toml: 'toml',
        cfg: 'properties',
        conf: 'properties',
        ini: 'properties',
        md: 'gfm',
        markdown: 'gfm'
    };
    const maxSizes = {
        image: 1024*1024*20,
        video: 1024*1024*100,
        audio: 1024*1024*100,
        text: 1024*1024*5,
        markdown: 1024*1024*5
    };
    const data = { isViewable: false, type: null, mime: null }
    for (const type in types) {
        if (types[type][ext]) {
            data.isViewable = true;
            data.type = type;
            data.mime = types[type][ext];
            data.codeMirrorMode = codeMirrorModes[ext] || null;
            break;
        }
    }
    if (data.isViewable && size) {
        if (size > maxSizes[data.type]) {
            data.isViewable = false;
        }
    }
    return data;
}

/**
 * Returns a boolean representing if the device has limited input capabilities (no hover and coarse pointer)
 */
const getIsMobileDevice = () => {
    const isPointerCoarse = window.matchMedia('(pointer: coarse)').matches;
    const isHoverNone = window.matchMedia('(hover: none)').matches;
    return isPointerCoarse && isHoverNone;
}

/**
 * Returns an object of headers for API requests that interface with the current active server
 */
const getHeaders = () => {
    const headers = {
        'sftp-host': activeConnection.host,
        'sftp-port': activeConnection.port,
        'sftp-username': activeConnection.username
    };
    if (activeConnection.password)
        headers['sftp-password'] = encodeURIComponent(activeConnection.password);
    if (activeConnection.key)
        headers['sftp-key'] = encodeURIComponent(activeConnection.key);
    return headers;
}

const api = {
    /**
     * Makes requests to the API
     * @param {'get'|'post'|'put'|'delete'} method The request method
     * @param {string} url The sub-URL of an API endpoint
     * @param {object|undefined} params An object of key-value query params
     * @param {*} body The body of the request, if applicable
     * @param {callback|undefined} onProgress A callback function that gets passed an Axios progress event
     * @returns {object} An object representing the response data or error info
     */
    request: async (method, url, params, body = null, onProgress = () => {}, responseType = 'json') => {
        url = `${httpProtocol}://${apiHost}/api/sftp/${url}`;
        try {
            const opts = {
                params, headers: getHeaders(),
                onUploadProgress: onProgress,
                onDownloadProgress: onProgress,
                responseType: responseType
            };
            let res = null;
            if (method == 'get' || method == 'delete') {
                res = await axios[method](url, opts);
            } else {
                res = await axios[method](url, body, opts);
            }
            //console.log(`Response from ${url}:`, res.data);
            return res.data;
        } catch (error) {
            if (responseType !== 'json') {
                console.error(error);
                return null;
            }
            if (error.response?.data) {
                console.warn(`Error ${error.response.status} response from ${url}:`, error.response.data);
                return error.response.data;
            } else {
                console.error(error);
                return {
                    success: false,
                    error: `${error}`
                };
            }
        }
    },
    get: (url, params) => api.request('get', url, params),
    post: (url, params, body) => api.request('post', url, params, body),
    put: (url, params, body) => api.request('put', url, params, body),
    delete: (url, params) => api.request('delete', url, params)
};

/**
 * Updates the bottom status bar.
 * @param {string} html The status text
 * @param {boolean} isError If `true`, turns the status red
 * @param {number|null} progress A 0-100 whole number to be used for the progress bar, or `null` to hide it
 * @returns {boolean} The negation of `isError`
 */
const setStatus = (html, isError = false, progress = null) => {
    elStatusBar.innerHTML = html;
    elStatusBar.classList.toggle('error', isError);
    elProgressBar.classList.remove('visible');
    if (progress !== null) {
        elProgressBar.classList.add('visible');
        elProgressBar.value = progress;
    }
    return !isError;
}

/**
 * Resolves with a download URL for a single file, or `false` if an error occurred.
 * @param {string} path The file path
 * @returns {Promise<string|boolean>}
 */
const getFileDownloadUrl = async path => {
    setStatus(`Getting single file download URL...`);
    const res = await api.get('files/get/single/url', {
        path: path
    });
    if (res.error) {
        return setStatus(`Error: ${res.error}`, true);
    }
    if (res.download_url) {
        return res.download_url;
    }
    return false;
}

/**
 * Starts a single-file download.
 * @param {string} path The file path
 */
const downloadFile = async path => {
    const url = await getFileDownloadUrl(path);
    if (url) {
        downloadUrl(url);
        setStatus(`Single file download started`);
    }
}