
const btnConnections = $('#connections');
const btnNavBack = $('#navBack');
const btnNavForward = $('#navForward');
const inputNavPath = $('#inputNavPath');
const btnGo = $('#pathGo');
const elBelowNavBar = $('#belowNavBar');
const btnUpload = $('#upload');
const btnDirCreate = $('#dirCreate');
const btnSelectionCut = $('#fileCut');
const btnSelectionCopy = $('#fileCopy');
const btnSelectionPaste = $('#filePaste');
const btnRename = $('#fileRename');
const btnSelectionMove = $('#fileMove');
const btnSelectionDelete = $('#fileDelete');
const btnDownload = $('#fileDownload');
const btnToggleHidden = $('#toggleHidden');
const btnSort = $('#dirSort');
const btnManageSelection = $('#dirSelection');
const elFiles = $('#files');
const elProgressBar = $('#progressBar');
const elStatusBar = $('#statusBar');
const log = [];
let activeConnection = null;
let activeConnectionId = null;
let backPaths = [];
let forwardPaths = [];
let connections = JSON.parse(window.localStorage.getItem('connections')) || {};
let selectionClipboard = [];
let isClipboardCut = false;
let sortType = window.localStorage.getItem('sortType') || 'name';
let sortDesc = window.localStorage.getItem('sortDesc');
sortDesc = (sortDesc == null) ? false : (sortDesc === 'true')
let showHidden = window.localStorage.getItem('showHidden');
showHidden = (showHidden == null) ? true : (showHidden === 'true');
let isUploading = false;
let lastSelectedIndex = -1;

// GPT-4-generated function to check if two HTML elements overlap
function doElementsOverlap(el1, el2) {
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();

    const overlap = !(rect1.right < rect2.left || 
                    rect1.left > rect2.right || 
                    rect1.bottom < rect2.top || 
                    rect1.top > rect2.bottom);

    return overlap;
}

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
    request: async (method, url, params, body = null, onProgress = () => {}) => {
        url = `/api/sftp/${url}`;
        try {
            const opts = {
                params, headers: getHeaders(),
                onUploadProgress: onProgress
            };
            let res = null;
            if (method == 'get' || method == 'delete') {
                res = await axios[method](url, opts);
            } else {
                res = await axios[method](url, body, opts);
            }
            console.log(`Response from ${url}:`, res.data);
            return res.data;
        } catch (error) {
            if (error.response?.data) {
                console.log(`Error ${error.response.status} response from ${url}:`, error.response.data);
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

const saveConnections = () => {
    window.localStorage.setItem('connections', JSON.stringify(connections));
}

const connectionManagerDialog = () => {
    const popup = new PopupBuilder();
    const el = document.createElement('div');
    el.id = 'connectionManager';
    el.classList = 'col gap-15';
    for (const id in connections) {
        const connection = connections[id];
        const entry = document.createElement('div');
        entry.classList = 'entry row align-center flex-wrap';
        entry.innerHTML = /*html*/`
            <div class="row gap-10 align-center flex-grow">
                <div class="icon">cloud</div>
                <div class="col gap-5">
                    <div class="label">${connection.name}</div>
                    <small>${connection.username}@${connection.host}:${connection.port}<br>${connection.path}</small>
                </div>
            </div>
            <div class="row gap-10 flex-wrap align-center justify-center">
                <button class="menu btn iconOnly small secondary" title="Connection options">
                    <div class="icon">more_vert</div>
                </button>
                <button class="connect btn iconOnly small" title="Connect">
                    <div class="icon">arrow_forward</div>
                </button>
            </div>
        `;
        $('.btn.menu', entry).addEventListener('click', () => {
            new ContextMenuBuilder()
                .addItem(option => option
                    .setLabel('Edit...')
                    .setIcon('edit')
                    .setClickHandler(async() => {
                        popup.hide();
                        await editConnectionDialog(id);
                        connectionManagerDialog();
                    }))
                .addItem(option => option
                    .setLabel('Export...')
                    .setIcon('download')
                    .setClickHandler(async() => {
                        const exportBody = document.createElement('div');
                        exportBody.classList = 'col gap-10';
                        exportBody.style.maxWidth = '400px';
                        exportBody.innerHTML = /*html*/`
                            <label class="selectOption">
                                <input type="radio" name="exportCredentials" value="exclude" checked>
                                Without credentials
                            </label>
                            <label class="selectOption">
                                <input type="radio" name="exportCredentials" value="include">
                                With private key or password
                            </label>
                            <small style="color: var(--red3)">Only share exports with credentials with people you trust! These credentials grant access to not only your server's files, but oftentimes an interactive terminal (SSH).</small>
                        `;
                        new PopupBuilder()
                            .setTitle(`Export ${connection.name}`)
                            .addBody(exportBody)
                            .addAction(action => action
                                .setLabel('Export')
                                .setIsPrimary(true)
                                .setClickHandler(() => {
                                    const includeCredentials = $('input[name="exportCredentials"]:checked', exportBody).value == 'include';
                                    const data = {
                                        name: connection.name,
                                        host: connection.host,
                                        port: connection.port,
                                        username: connection.username,
                                        path: connection.path
                                    };
                                    if (includeCredentials) {
                                        if (connection.key)
                                            data.key = connection.key;
                                        if (connection.password)
                                            data.password = connection.password;
                                    }
                                    const blob = new Blob([
                                        JSON.stringify(data)
                                    ], {
                                        type: 'application/json'
                                    });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `${connection.name.replace(/[^a-zA-Z-_\. ]/g, '').trim() || 'connection'}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }))
                            .addAction(action => action.setLabel('Cancel'))
                            .show();
                    }))
                .addSeparator()
                .addItem(option => option
                    .setLabel('Delete')
                    .setIcon('delete')
                    .setIsDanger(true)
                    .setClickHandler(async() => {
                        delete connections[id];
                        saveConnections();
                        entry.remove();
                    }))
                .showAtCursor();
        });
        $('.btn.connect', entry).addEventListener('click', () => {
            popup.hide();
            setActiveConnection(id);
        });
        el.appendChild(entry);
    }
    const btnsCont = document.createElement('div');
    btnsCont.classList = 'row gap-10 flex-wrap';
    const btnAdd = document.createElement('button');
    btnAdd.classList = 'btn success small';
    btnAdd.innerHTML = /*html*/`
        <div class="icon">add</div>
        New connection...
    `;
    btnAdd.addEventListener('click', async() => {
        popup.hide();
        await addNewConnectionDialog();
        connectionManagerDialog();
    });
    btnsCont.appendChild(btnAdd);
    const btnImport = document.createElement('button');
    btnImport.classList = 'btn secondary small';
    btnImport.innerHTML = /*html*/`
        <div class="icon">cloud_upload</div>
        Import...
    `;
    btnImport.addEventListener('click', async() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', async() => {
            const file = input.files[0];
            if (!file) return;
            popup.hide();
            const reader = new FileReader();
            reader.addEventListener('load', async() => {
                const data = JSON.parse(reader.result);
                const id = Date.now();
                connections[id] = data;
                saveConnections();
                if (!data.key && !data.password) {
                    return editConnectionDialog(id);
                }
                connectionManagerDialog();
            });
            reader.readAsText(file);
        });
        input.click();
    });
    btnsCont.appendChild(btnImport);
    el.appendChild(btnsCont);
    popup
        .setTitle('Connections')
        .addBody(el)
        .addAction(action => action
            .setIsPrimary(true)
            .setLabel('Done')
            .setClickHandler(() => {
                saveConnections();
            }));
    popup.show();
}

const editConnectionDialog = async (id) => new Promise(resolve => {
    const connection = connections[id];
    if (!connection) throw new Error(`Connection with ID ${id} not found!`);
    const securityNote = thing => `Your ${thing} is saved in this browser and only persists on the server during and for a minute after requests.`;
    const el = document.createElement('div');
    el.classList = 'col gap-10';
    el.innerHTML = /*html*/`
        <div style="width: 300px">
            <label>Friendly name</label>
            <input type="text" class="textbox" id="inputName" value="${connection.name}" placeholder="My Server">
        </div>
        <div class="row gap-10 flex-wrap">
            <div style="width: 300px">
                <label>Host</label>
                <input type="text" class="textbox" id="inputHost" value="${connection.host}" placeholder="example.com">
            </div>
            <div style="width: 120px">
                <label>Port</label>
                <input type="number" class="textbox" id="inputPort" value="${connection.port}" placeholder="22">
            </div>
        </div>
        <div style="width: 200px">
            <label>Username</label>
            <input type="text" class="textbox" id="inputUsername" value="${connection.username}" placeholder="kayla">
        </div>
        <div style="width: 300px">
            <label>Authentication</label>
            <div class="row gap-10 flex-wrap">
                <label class="selectOption">
                    <input id="authTypePassword" type="radio" name="authType" value="password">
                    Password
                </label>
                <label class="selectOption">
                    <input id="authTypeKey" type="radio" name="authType" value="key">
                    Private key
                </label>
            </div>
        </div>
        <div id="passwordCont" style="width: 300px" class="col gap-5">
            <input type="password" class="textbox" id="inputPassword" value="${connection.password || ''}" placeholder="Password">
            <small>${securityNote('password')}</small>
        </div>
        <div id="keyCont" class="col gap-5" style="width: 500px">
            <div class="row">
                <button id="loadKeyFromFile" class="btn secondary small">
                    <div class="icon">key</div>
                    Load from file
                </button>
            </div>
            <div class="textbox textarea">
                <textarea id="inputKey" placeholder="Private key..." rows="5">${connection.key || ''}</textarea>
            </div>
            <small>Your private key is typically located under <b>C:\\Users\\you\\.ssh</b> on Windows, or <b>/home/you/.ssh</b> on Unix. It's not the ".pub" file! The server has to be configured to accept your public key for your private one to work.</small>
            <small>${securityNote('private key')}</small>
        </div>
        <div style="width: 300px">
            <label>Starting path</label>
            <input type="text" class="textbox" id="inputPath" value="${connection.path}" placeholder="/home/kayla">
        </div>
    `;
    const inputName = $('#inputName', el);
    const inputHost = $('#inputHost', el);
    const inputPort = $('#inputPort', el);
    const inputUsername = $('#inputUsername', el);
    const authTypePassword = $('#authTypePassword', el);
    const authTypeKey = $('#authTypeKey', el);
    const inputPassword = $('#inputPassword', el);
    const elPasswordCont = $('#passwordCont', el);
    const elKeyCont = $('#keyCont', el);
    const inputKey = $('#inputKey', el);
    const btnLoadKey = $('#loadKeyFromFile', el);
    const inputPath = $('#inputPath', el);
    authTypePassword.addEventListener('change', () => {
        elPasswordCont.style.display = '';
        elKeyCont.style.display = 'none';
    });
    authTypeKey.addEventListener('change', () => {
        elPasswordCont.style.display = 'none';
        elKeyCont.style.display = '';
    });
    if (!connection.password && !connection.key) {
        authTypeKey.checked = true;
        authTypeKey.dispatchEvent(new Event('change'));
    } else if (!connection.password) {
        authTypeKey.checked = true;
        authTypeKey.dispatchEvent(new Event('change'));
    } else {
        authTypePassword.checked = true;
        authTypePassword.dispatchEvent(new Event('change'));
    }
    btnLoadKey.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (file.size > 1024) return;
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                inputKey.value = reader.result;
            });
            reader.readAsText(file);
        });
        input.click();
    });
    const popup = new PopupBuilder()
        .setTitle('Edit connection')
        .addBody(el);
    popup.addAction(action => action
        .setIsPrimary(true)
        .setLabel('Save')
        .setClickHandler(() => {
            connection.host = inputHost.value;
            connection.port = inputPort.value || 22;
            connection.username = inputUsername.value;
            connection.name = inputName.value || `${connection.username}@${connection.host}`;
            if (authTypePassword.checked) {
                connection.password = inputPassword.value;
                delete connection.key;
            } else {
                connection.key = inputKey.value;
                delete connection.password;
            }
            connection.path = inputPath.value;
            saveConnections();
        }));
    popup.addAction(action => action.setLabel('Cancel'));
    popup.show();
    popup.setOnHide(() => resolve(id));
});

const addNewConnectionDialog = async() => {
    const id = Date.now();
    connections[id] = {
        name: 'New Connection',
        host: '',
        port: 22,
        username: '',
        key: '',
        password: '',
        path: '/'
    };
    await editConnectionDialog(id);
    if (!connections[id].host || !connections[id].username) {
        delete connections[id];
    }
}

const setActiveConnection = (id, path) => {
    if (!connections[id]) {
        throw new Error(`Connection with ID ${id} not found!`);
    }
    backPaths = [];
    forwardPaths = [];
    activeConnection = JSON.parse(JSON.stringify(connections[id]));
    activeConnectionId = id;
    selectionClipboard = [];
    changePath(path, false);
}

const setStatus = (status, isError = false, progress = null) => {
    elStatusBar.innerHTML = status;
    elStatusBar.classList.toggle('error', isError);
    elProgressBar.classList.remove('visible');
    if (progress !== null) {
        elProgressBar.classList.add('visible');
        elProgressBar.value = progress;
    }
    log.push({
        isError, status
    });
}

const changePath = async(path, pushState = true) => {
    loadStartTime = Date.now();
    if (!activeConnection) return;
    // Use the current path if none is specified
    path = path || activeConnection.path;
    // Disable nav buttons while statting
    btnNavBack.disabled = true;
    btnNavForward.disabled = true;
    btnGo.disabled = true;
    // Check if the path exists
    setStatus(`Checking path...`);
    const dataExist = await api.get('files/exists', { path: path });
    // If there was an error
    if (dataExist.error) {
        setStatus(`Error: ${dataExist.error}`, true);
    // If the path doesn't exist
    } else if (!dataExist.exists) {
        setStatus(`Error: Path doesn't exist`, true);
    // Otherwise...
    } else {
        // Update the path bar
        inputNavPath.value = dataExist.path;
        // If the path has changed, push the old path to the back history
        if (pushState && activeConnection.path != path)
            backPaths.push(activeConnection.path);
        // Update the stored current path
        activeConnection.path = dataExist.path;
        // Update display
        document.title = `${activeConnection.name} - ${activeConnection.path}`;
        window.history.replaceState(null, null, `?con=${activeConnectionId}&path=${encodeURIComponent(activeConnection.path)}`);
        // If the path is a directory, load it
        if (dataExist.type == 'd') {
            await loadDirectory(dataExist.path);
        // If the path is a file, load it
        } else {
            await loadFile(dataExist.path);
            await changePath(`${path}/..`, false);
        }
    }
    // Re-enable nav buttons accordingly
    btnNavBack.disabled = (backPaths.length == 0);
    btnNavForward.disabled = (forwardPaths.length == 0);
    btnGo.disabled = false;
}

const loadDirectory = async path => {
    // Remove all existing file elements
    elFiles.innerHTML = '';
    lastSelectedIndex = -1;
    // Disable directory controls
    updateDirControls();
    btnUpload.disabled = true;
    btnDirCreate.disabled = true;
    btnDownload.disabled = true;
    btnSort.disabled = true;
    // Get a directory listing
    setStatus(`Loading directory...`);
    const data = await api.get('directories/list', { path: path });
    // If an error occurred, update the status bar
    // then set the file list to an empty array
    if (data.error) {
        setStatus(`Error: ${data.error}`, true);
        data.list = [];
    }
    // Make separate arrays for folders and files
    const onlyDirs = [];
    const onlyFiles = [];
    for (const file of data.list) {
        if (file.type === 'd') {
            onlyDirs.push(file);
        } else {
            onlyFiles.push(file);
        }
    }
    // Define sorting functions
    const sortFuncs = {
        name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
        size: (a, b) => a.size - b.size,
        date: (a, b) => a.modifyTime - b.modifyTime
    };
    // Sort the lists of folders and files by the selected sort type
    onlyDirs.sort(sortFuncs[sortType]);
    onlyFiles.sort(sortFuncs[sortType]);
    // Reverse them if sorting descending
    if (sortDesc) {
        onlyDirs.reverse();
        onlyFiles.reverse();
    }
    // Combine the file list and add the ".." directory
    const list = [{
        unselectable: true,
        name: '..',
        type: 'd',
        longname: '-'
    }, ...onlyDirs, ...onlyFiles];
    // Loop through the list and create file elements
    let fileSelectLocked = false;
    let i = 0;
    for (const file of list) {
        const elFile = document.createElement('button');
        elFile.classList = 'btn fileEntry row gap-10';
        // If the file is "hidden", give it the class
        if (file.name != '..' && file.name.substring(0, 1) === '.') {
            elFile.classList.add('hidden');
        }
        // Add data attributes to the file element
        elFile.dataset.path = `${data.path}/${file.name}`;
        elFile.dataset.type = file.type;
        elFile.dataset.name = file.name;
        elFile.dataset.index = i;
        i++;
        // Get some formatted file info
        let icon = 'insert_drive_file';
        if (file.type == 'd') icon = 'folder';
        if (file.type == 'l') icon = 'file_present';
        if (file.type == 'b') icon = 'save';
        if (file.type == 'p') icon = 'filter_alt';
        if (file.type == 'c') icon = 'output';
        if (file.type == 's') icon = 'wifi';
        const sizeFormatted = (file.size && file.type !== 'd') ? formatSize(file.size) : '-';
        const dateRelative = file.modifyTime ? getRelativeDate(file.modifyTime) : '-';
        const dateAbsolute = file.modifyTime ? dayjs(file.modifyTime).format('MMM D, YYYY, h:mm A') : null;
        const perms = file.longname.split(' ')[0].replace(/\*/g, '');
        const permsNum = (() => {
            let temp;
            let str = '';
            const user = perms.substring(1, 4);
            const group = perms.substring(4, 7);
            const other = perms.substring(7, 10);
            for (const perm of [user, group, other]) {
                temp = 0;
                if (perm.includes('r')) temp += 1;
                if (perm.includes('w')) temp += 2;
                if (perm.includes('x')) temp += 4;
                str += temp;
            }
            return str;
        })();
        // Build the HTML
        elFile.innerHTML = /*html*/`
            <div class="icon flex-no-shrink">${icon}</div>
            <div class="nameCont col gap-5 flex-grow">
                <div class="name"><span title="${file.name}">${file.name}</span></div>
            </div>
            <div class="date flex-no-shrink" ${dateAbsolute ? `title="${dateAbsolute}"`:''}>${dateRelative}</div>
            <div class="size flex-no-shrink">${sizeFormatted}</div>
            <div class="perms flex-no-shrink" title="${permsNum}">${perms}</div>
        `;
        // Handle clicks on the file element
        let lastClick = 0;
        elFile.addEventListener('click', e => {
            e.stopPropagation();
            // If the control key isn't held
            if (!e.ctrlKey) {
                // If this is a double-click
                if ((Date.now()-lastClick) < 300) {
                    if (fileSelectLocked) return;
                    // Handle file loading accordingly
                    if (file.type !== 'd') {
                        loadFile(elFile.dataset.path);
                    } else {
                        // Lock file selection to prevent double-clicking
                        // during load and clear forward history
                        fileSelectLocked = true;
                        forwardPaths = [];
                        changePath(elFile.dataset.path);
                    }
                }
            }
            // Update our last click time
            lastClick = Date.now();
            // Return if unselectable
            if (file.unselectable) return;
            // Handle selection
            if (e.shiftKey && lastSelectedIndex >= 0) {
                // Select all files between the last selected file and this one
                // Based on this file's index and lastSelectedIndex
                const files = [...$$('#files .fileEntry', elFiles)];
                const start = Math.min(lastSelectedIndex, parseInt(elFile.dataset.index));
                const end = Math.max(lastSelectedIndex, parseInt(elFile.dataset.index));
                for (let j = start; j <= end; j++) {
                    const el = files[j];
                    selectFile(el.dataset.path, false, false, false);
                }
            } else {
                // Update selection based on shift and ctrl key state
                const state = e.shiftKey || e.ctrlKey;
                selectFile(elFile.dataset.path, !state, state);
            }
        });
        // Handle keypresses on the file element
        elFile.addEventListener('keydown', e => {
            // If the enter key is pressed
            if (e.code === 'Enter') {
                // Handle file loading accordingly
                if (file.type !== 'd') {
                    loadFile(elFile.dataset.path);
                } else {
                    changePath(elFile.dataset.path);
                }
            }
            // Focus the next file
            if (e.code == 'ArrowDown') {
                e.preventDefault();
                const next = elFile.nextElementSibling;
                if (next) next.focus();
            }
            // Focus the previous file
            if (e.code == 'ArrowUp') {
                e.preventDefault();
                const prev = elFile.previousElementSibling;
                if (prev) prev.focus();
            }
            // If the escape key is pressed, deselect all files
            if (e.code === 'Escape') {
                deselectAllFiles();
            }
            // Return if unselectable
            if (file.unselectable) return;
            // If the spacebar is pressed
            if (e.code === 'Space') {
                // Prevent scrolling
                e.preventDefault();
                // Update selection based on ctrl key state
                if (!file.unselectable)
                    selectFile(elFile.dataset.path, !e.ctrlKey, true);
            }
        });
        // Add the file element to the file list
        elFiles.appendChild(elFile);
    }
    // Re-enable directory controls accordingly
    if (!data.error) {
        btnUpload.disabled = false;
        btnDirCreate.disabled = false;
        btnDownload.disabled = false;
        btnSort.disabled = false;
        updateDirControls();
        setStatus(`Loaded directory with ${list.length} items in ${Date.now()-loadStartTime}ms`);
    }
}

const loadFile = async path => {
    downloadFile(path);
}

const downloadFile = async path => {
    const res = await api.get('files/get/single/url', {
        path: path
    });
    if (res.error) {
        return setStatus(`Error: ${res.error}`, true);
    }
    if (res.download_url) {
        window.location.href = res.download_url;
        setStatus(`Single file download started`);
    }
}

const downloadZip = async(paths, rootPath = '/') => {
    const pathsJson = JSON.stringify(paths);
    if (pathsJson.length > 1900) {
        return setStatus(`Error: Too many selected paths for zip download`, true);
    }
    const res = await api.get('files/get/multi/url', {
        paths: pathsJson,
        rootPath: rootPath
    });
    if (res.error) {
        return setStatus(`Error: ${res.error}`, true);
    }
    if (res.download_url) {
        window.location.href = res.download_url;
        setStatus(`Zip file download started`);
    }
}

const updateDirControls = () => {
    const selectedFiles = $$('.selected', elFiles);
    btnSelectionCut.disabled = true;
    btnSelectionCopy.disabled = true;
    btnSelectionPaste.disabled = true;
    btnRename.disabled = true;
    btnSelectionMove.disabled = true;
    btnSelectionDelete.disabled = true;
    // When no files are selected
    if (selectedFiles.length == 0) {
        // ...
    // When files are selected
    } else {
        // When a single file is selected
        if (selectedFiles.length == 1) {
            btnRename.disabled = false;
        }
        btnSelectionCut.disabled = false;
        btnSelectionCopy.disabled = false;
        btnSelectionMove.disabled = false;
        btnSelectionDelete.disabled = false;
    }
    // When there are files in the clipboard
    if (selectionClipboard.length > 0) {
        btnSelectionPaste.disabled = false;
    }
}

const getSelectedFiles = () => $$('.selected', elFiles);

const selectFile = (path, deselectOthers = true, toggle = false, focus = false) => {
    const el = $(`#files .fileEntry[data-path="${path}"]`, elFiles);
    if (!el) return;
    const isSelected = el.classList.contains('selected');
    if (deselectOthers) deselectAllFiles();
    if (toggle)
        el.classList.toggle('selected', !isSelected);
    else
        el.classList.add('selected');
    if (focus)
        el.focus();
    lastSelectedIndex = parseInt(el.dataset.index);
    updateDirControls();
}

const selectAllFiles = () => {
    const files = [...$$('#files .fileEntry', elFiles)];
    files.shift();
    for (const el of files) {
        el.classList.add('selected');
    }
    lastSelectedIndex = files.length-1;
    updateDirControls();
}

const deselectAllFiles = () => {
    const selected = getSelectedFiles();
    for (const el of selected) {
        el.classList.remove('selected');
    }
    lastSelectedIndex = -1;
    updateDirControls();
}

const invertFileSelection = () => {
    const files = [...$$('#files .fileEntry', elFiles)];
    files.shift();
    for (const el of files) {
        el.classList.toggle('selected');
    }
    lastSelectedIndex = parseInt($('#files .fileEntry:last-child', elFiles).dataset.index) || -1;
    updateDirControls();
}

const createDirectoryDialog = async() => {
    const el = document.createElement('div');
    el.innerHTML = /*html*/`
        <div style="width: 300px">
            <input type="text" class="textbox" id="inputDirName" placeholder="Folder name">
        </div>
    `;
    const inputDirName = $('#inputDirName', el);
    const popup = new PopupBuilder()
        .setTitle('New folder')
        .addBody(el)
        .addAction(action => action
            .setIsPrimary(true)
            .setLabel('Create')
            .setClickHandler(async() => {
                const name = inputDirName.value;
                if (!name) return;
                const path = `${activeConnection.path}/${name}`;
                const data = await api.post('directories/create', { path: path });
                if (data.error) {
                    setStatus(`Error: ${data.error}`, true);
                } else {
                    await changePath();
                    selectFile(data.path, true, false, true);
                }
            }))
        .addAction(action => action.setLabel('Cancel'))
        .show();
    inputDirName.focus();
    inputDirName.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            $('.btn:first-of-type', popup.el).click();
        }
    });
}

const renameFileDialog = async path => {
    const el = document.createElement('div');
    const currentName = path.split('/').pop();
    el.innerHTML = /*html*/`
        <div style="width: 300px">
            <input type="text" class="textbox" id="inputFileName" placeholder="${currentName}" value="${currentName}">
        </div>
    `;
    const input = $('#inputFileName', el);
    const popup = new PopupBuilder()
        .setTitle(`Rename file`)
        .addBody(el)
        .addAction(action => action
            .setIsPrimary(true)
            .setLabel('Rename')
            .setClickHandler(async() => {
                const name = input.value;
                if (!name) return;
                const pathOld = path;
                const pathNew = pathOld.split('/').slice(0, -1).join('/') + '/' + name;
                // Check if the new path exists
                const resExistsCheck = await api.get('files/exists', { path: pathNew });
                if (resExistsCheck.exists) {
                    const replaceStatus = await replaceDialog(pathNew);
                    if (replaceStatus == 'skip' || replaceStatus == 'skipAll')
                        return setStatus(`Rename cancelled`);
                    await deleteFile(pathNew, false);
                }
                const data = await api.put('files/move', {
                    pathOld, pathNew
                });
                if (data.error) {
                    setStatus(`Error: ${data.error}`, true);
                } else {
                    const pathNewDir = data.pathNew.split('/').slice(0, -1).join('/');
                    await changePath(pathNewDir);
                    selectFile(data.pathNew, true, false, true);
                }
            }))
        .addAction(action => action.setLabel('Cancel'))
        .show();
    input.focus();
    input.select();
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            $('.btn:first-of-type', popup.el).click();
        }
    });
}

const selectDirDialog = async(startPath = activeConnection.path, title = 'Select folder', actionLabel = 'Select') => new Promise(resolve => {
    const el = document.createElement('div');
    el.innerHTML = /*html*/`
        <div class="moveFilesPicker col gap-10" style="width: 500px">
            <div class="row gap-10">
                <input type="text" class="textbox" id="inputDirPath" placeholder="${startPath}">
                <button class="btn secondary iconOnly go">
                    <div class="icon">keyboard_return</div>
                </button>
            </div>
            <div class="folders col"></div>
        </div>
    `;
    const input = $('#inputDirPath', el);
    const btnGo = $('.btn.go', el);
    const elFolders = $('.folders', el);
    const loadFolders = async dir => {
        elFolders.innerHTML = '';
        const data = await api.get('directories/list', {
            path: dir, dirsOnly: true
        });
        const subDirs = data.list || [];
        subDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (dir != '/') subDirs.unshift({ name: '..' });
        for (const subDir of subDirs) {
            const elDir = document.createElement('button');
            elDir.classList = 'btn fileEntry row gap-10';
            if (subDir.name != '..' && subDir.name.substring(0, 1) === '.')
                elDir.classList.add('hidden');
            let subDirPath = path = `${dir}/${subDir.name}`;
            elDir.innerHTML = /*html*/`
                <div class="icon flex-no-shrink">folder</div>
                <div class="nameCont flex-grow">
                    <div class="name"><span title="${subDir.name}">${subDir.name}</span></div>
                </div>
            `;
            elDir.addEventListener('click', () => {
                loadFolders(subDirPath);
            });
            elFolders.appendChild(elDir);
        }
        if (data.path) input.value = data.path;
    };
    btnGo.addEventListener('click', () => loadFolders(input.value || startPath || '/'));
    btnGo.click();
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            btnGo.click();
        }
    });
    new PopupBuilder()
        .setTitle(title)
        .addBody(el)
        .addAction(action => action
            .setIsPrimary(true)
            .setLabel(actionLabel)
            .setClickHandler(() => resolve(input.value)))
        .addAction(action => action.setLabel('Cancel'))
        .setOnHide(() => resolve(null))
        .show();
});

const moveFiles = async(newDirPath, filePaths) => {
    // Loop through selected files
    const newPaths = [];
    let i = 0;
    let replaceStatus = null;
    for (const pathOld of filePaths) {
        const name = pathOld.split('/').pop();
        const pathNew = `${newDirPath}/${name}`;
        if (pathOld == pathNew) continue;
        setStatus(`Moving file: ${pathOld}`, false, Math.round((i/filePaths.length)*100));
        i++;
        // Check if the new path exists
        // If it does, prompt the user to replace it
        const resExistsCheck = await api.get('files/exists', { path: pathNew });
        if (resExistsCheck.exists) {
            if (replaceStatus != 'replaceAll') {
                if (replaceStatus != 'skipAll') {
                    replaceStatus = await replaceDialog(pathNew);
                }
                if (replaceStatus == 'skip' || replaceStatus == 'skipAll') {
                    setStatus(`File move skipped`);
                    continue;
                }
            }
            await deleteFile(pathNew, false);
        }
        const data = await api.put('files/move', {
            pathOld, pathNew
        });
        if (data.error) {
            setStatus(`Error: ${data.error}`, true);
            return false;
        }
        const el = $(`#files .fileEntry[data-path="${pathOld}"]`, elFiles);
        if (el) el.remove();
        newPaths.push(data.pathNew);
    }
    if (newPaths.length > 0) {
        setStatus(`Moved ${newPaths.length} file(s) to ${newDirPath}`);
        return newPaths;
    }
    return false;
}

const moveFilesDialog = async() => {
    const selected = [...getSelectedFiles()].map(el => el.dataset.path);
    // Prompt the user to select a directory
    const newDirPath = await selectDirDialog(undefined, `Move ${selected.length > 1 ? `${selected.length} files`:'file'}`, 'Move here');
    if (!newDirPath) return;
    // Move the files
    moveFiles(newDirPath, selected);
}

const replaceDialog = path => new Promise(resolve => {
    const el = document.createElement('div');
    el.innerHTML = `
        <p><b>${path}</b> already exists. Do you want to replace it?</p>
        <label class="selectOption">
            <input type="checkbox">
            Do this for all other files
        </label>
    `;
    const checkbox = $('input', el);
    new PopupBuilder()
        .setTitle(`File exists`)
        .addBody(el)
        .addAction(action => action
            .setIsPrimary(true)
            .setLabel('Replace')
            .setClickHandler(() => resolve(checkbox.checked ? 'replaceAll':'replace')))
        .addAction(action => action
            .setLabel('Skip')
            .setClickHandler(() => resolve(checkbox.checked ? 'skipAll':'skip')))
        .show();
});

const uploadFiles = async files => {
    if (isUploading) return new PopupBuilder()
        .setTitle('Upload in progress')
        .addBodyHTML('<p>An upload is already in progress. Wait for it to finish before uploading more files.</p>')
        .addAction(action => action.setIsPrimary(true).setLabel('Okay'))
        .show();
    isUploading = true;
    let isCancelled = false;
    let replaceStatus = null;
    // Handle status and progress bar
    let lastStatusSet = 0;
    const setUploadStatus = (text, progress = 0) => {
        if ((Date.now()-lastStatusSet) < 500) return;
        setStatus(`<span><a href="#" class="text-danger" style="text-decoration: none">Cancel</a> | ${text}</span>`, false, progress);
        const anchor = $('a', elStatusBar);
        anchor.addEventListener('click', e => {
            isCancelled = true;
        });
        lastStatusSet = Date.now();
    };
    // Loop through selected files
    const paths = [];
    for (const file of files) {
        if (isCancelled) break;
        setUploadStatus(`Uploading file: ${file.name}`);
        // Check if the path exists
        let path = `${activeConnection.path}/${file.name}`;
        const resExistenceCheck = await api.get('files/exists', { path: path });
        path = resExistenceCheck.path;
        // If the file exists, prompt the user to replace it
        if (resExistenceCheck.exists) {
            if (replaceStatus != 'replaceAll') {
                if (replaceStatus != 'skipAll') {
                    replaceStatus = await replaceDialog(path);
                }
                if (replaceStatus == 'skip' || replaceStatus == 'skipAll') {
                    setStatus(`Upload skipped`);
                    continue;
                }
            }
            const resDelete = await deleteFile(path, false);
            if (resDelete.error) return;
        }
        // Upload the file in chunks
        const chunkSize = 1024*1024*8;
        const chunks = Math.ceil(file.size / chunkSize);
        for (let i = 0; i < chunks; i++) {
            if (isCancelled) break;
            // Upload the chunk
            const start = i * chunkSize;
            const end = Math.min(file.size, (i+1) * chunkSize);
            const chunk = file.slice(start, end);
            const res = await api.request('put', 'files/append', {
                path: path
            }, chunk, e => {
                // Update status with progress
                const bytesTotal = file.size;
                const bytesUploaded = Math.min((i*chunkSize)+e.loaded, bytesTotal);
                const percentUploaded = Math.round((bytesUploaded/bytesTotal)*100);
                setUploadStatus(`Uploading file: ${file.name} | ${formatSize(bytesUploaded)} of ${formatSize(bytesTotal)}`, percentUploaded);
            });
            // If there's an error, force stop the whole upload process
            if (res.error) {
                setStatus(`Error: ${res.error}`, true);
                isUploading = false;
                return;
            }
        }
        // If the upload was cancelled, delete the file
        if (isCancelled) {
            await deleteFile(path, false);
            setStatus(`Upload cancelled`);
            break;
        }
        // Add the path to the list of uploaded files
        paths.push(path);
    }
    // Refresh the file list and select the uploaded files
    isUploading = false;
    if (paths.length == 0) return;
    await changePath(paths[0].split('/').slice(0, -1).join('/'));
    for (const path of paths) {
        selectFile(path, false, false, true);
    }
}

const uploadFilesPrompt = async() => {
    // Prompt user to select files
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.click();
    // When files are selected
    input.addEventListener('change', () => {
        uploadFiles(input.files);
    });
}

const deleteFile = async(path, refresh = true) => {
    const data = await api.delete('files/delete', { path: path });
    if (data.error) {
        setStatus(`Error: ${data.error}`, true);
    } else {
        if (refresh)
            changePath();
    }
    return data;
}

const deleteDirectory = async(path, refresh = true) => {
    const data = await api.delete('directories/delete', { path: path });
    if (data.error) {
        setStatus(`Error: ${data.error}`, true);
    } else {
        if (refresh)
            changePath();
    }
    return data;
}

btnConnections.addEventListener('click', () => {
    const menu = new ContextMenuBuilder();
    for (const id in connections) {
        const connection = connections[id];
        menu.addItem(option => option
            .setLabel(connection.name)
            .setIcon('cloud')
            .setTooltip(`Click to connect to ${connection.name}<br><small>${connection.username}@${connection.host}:${connection.port}<br>${connection.path}</small>`)
            .setClickHandler(() => {
                setActiveConnection(id);
            }));
    };
    menu.addSeparator();
    menu.addItem(option => option
        .setLabel('Manage connections...')
        .setIcon('smb_share')
        .setClickHandler(connectionManagerDialog));
    menu.addItem(option => option
        .setLabel('New connection...')
        .setIcon('library_add')
        .setClickHandler(addNewConnectionDialog));
    const rect = btnConnections.getBoundingClientRect();
    menu.showAtCoords(rect.left, rect.bottom-5);
});

btnNavBack.addEventListener('click', () => {
    if (backPaths.length > 0) {
        forwardPaths.push(activeConnection.path);
        changePath(backPaths.pop(), false);
    }
});
btnNavForward.addEventListener('click', () => {
    if (forwardPaths.length > 0) {
        backPaths.push(activeConnection.path);
        changePath(forwardPaths.pop(), false);
    }
});

inputNavPath.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        btnGo.click();
    }
});
btnGo.addEventListener('click', () => {
    changePath(inputNavPath.value || '/');
});

btnUpload.addEventListener('click', uploadFilesPrompt);

btnDirCreate.addEventListener('click', createDirectoryDialog);

btnRename.addEventListener('click', () => {
    renameFileDialog(getSelectedFiles()[0].dataset.path);
});

btnSelectionCut.addEventListener('click', () => {
    selectionClipboard = [...getSelectedFiles()].map(el => el.dataset.path);
    const prevEls = [...$$('.cut', elFiles), ...$$('.copied', elFiles)];
    for (const el of prevEls) el.classList.remove('cut', 'copied');
    for (const path of selectionClipboard) {
        const el = $(`#files .fileEntry[data-path="${path}"]`, elFiles);
        el.classList.add('cut');
    }
    isClipboardCut = true;
    setStatus(`Cut ${selectionClipboard.length} file path(s) to selection clipboard`);
    updateDirControls();
});
btnSelectionCopy.addEventListener('click', () => {
    selectionClipboard = [...getSelectedFiles()].map(el => el.dataset.path);
    const prevEls = [...$$('.cut', elFiles), ...$$('.copied', elFiles)];
    for (const el of prevEls) el.classList.remove('cut', 'copied');
    for (const path of selectionClipboard) {
        const el = $(`#files .fileEntry[data-path="${path}"]`, elFiles);
        el.classList.add('copied');
    }
    isClipboardCut = false;
    setStatus(`Copied ${selectionClipboard.length} file path(s) to selection clipboard`);
    updateDirControls();
});
btnSelectionPaste.addEventListener('click', async() => {
    // Move files
    let newPaths = true;
    if (isClipboardCut) {
        const newDirPath = activeConnection.path;
        if (!newDirPath) return;
        // Move the files
        newPaths = await moveFiles(newDirPath, selectionClipboard);
        if (!newPaths) return;
        // Clear the clipboard
        selectionClipboard = [];
    // Copy files
    } else {
        return setStatus(`Can't copy files yet!`, true);
    }
    // Reload directory
    await changePath();
    // Select the new files
    for (const path of newPaths) {
        selectFile(path, false, false, true);
    }
});

btnSelectionMove.addEventListener('click', moveFilesDialog);

btnSelectionDelete.addEventListener('click', async() => {
    const selected = [...getSelectedFiles()];
    const containsDirs = selected.some(el => el.dataset.type === 'd');
    new PopupBuilder()
        .setTitle(`Delete ${selected.length == 1 ? 'file':`${selected.length} files`}`)
        .addBodyHTML(`
            <p>Are you sure you want to delete ${selected.length == 1 ? `<b>${selected[0].dataset.name}</b>`:`these files`}?</p>
            ${containsDirs ? `<p class="text-danger">
                ${selected.length == 1 ? 'This file is a directory':'Your selection contains directories'}! Deleting ${selected.length == 1 ? 'it':'them'} will also delete everything inside of ${selected.length == 1 ? 'it':'them'}.
            </p>`:''}
            <p>This usually can't be undone!</p>
        `)
        .addAction(action => action
            .setIsDanger(true)
            .setLabel('Delete')
            .setClickHandler(async() => {
                let i = 0;
                for (const el of selected) {
                    setStatus(`Deleting file: ${el.dataset.path}`, false, Math.round((i/selected.length)*100));
                    let res = null;
                    if (el.dataset.type === 'd') {
                        res = await deleteDirectory(el.dataset.path, false);
                    } else {
                        res = await deleteFile(el.dataset.path, false);
                    }
                    if (res.success)
                        el.remove();
                    i++;
                }
                setStatus(`Deleted ${selected.length} file(s)`);
                updateDirControls();
            }))
        .addAction(action => action.setLabel('Cancel'))
        .show();
});

btnDownload.addEventListener('click', () => {
    const selected = [...getSelectedFiles()];
    const rootPath = activeConnection.path;
    if (selected.length == 1) {
        if (selected[0].dataset.type === 'd') {
            downloadZip([ selected[0].dataset.path ], rootPath);
        } else {
            downloadFile(selected[0].dataset.path);
        }
    } else if (selected.length > 1) {
        downloadZip(selected.map(el => el.dataset.path), rootPath);
    } else {
        downloadZip([ activeConnection.path ], rootPath);
    }
});

btnSort.addEventListener('click', () => {
    const menu = new ContextMenuBuilder();
    const changeType = type => {
        sortType = type;
        window.localStorage.setItem('sortType', sortType);
        changePath();
    };
    const changeDirection = desc => {
        sortDesc = desc;
        window.localStorage.setItem('sortDesc', sortDesc);
        changePath();
    };
    menu.addItem(item => item
        .setIcon(sortType === 'name' ? 'check' : '')
        .setLabel('Name')
        .setClickHandler(() => changeType('name')));
    menu.addItem(item => item
        .setIcon(sortType === 'date' ? 'check' : '')
        .setLabel('Modified')
        .setClickHandler(() => changeType('date')));
    menu.addItem(item => item
        .setIcon(sortType === 'size' ? 'check' : '')
        .setLabel('Size')
        .setClickHandler(() => changeType('size')));
    menu.addSeparator();
    menu.addItem(item => item
        .setIcon(!sortDesc ? 'check' : '')
        .setLabel('Ascending')
        .setClickHandler(() => changeDirection(false)));
    menu.addItem(item => item
        .setIcon(sortDesc ? 'check' : '')
        .setLabel('Descending')
        .setClickHandler(() => changeDirection(true)));
    const rect = btnSort.getBoundingClientRect();
    menu.showAtCoords(rect.left, rect.bottom-5);
});

btnManageSelection.addEventListener('click', () => {
    const menu = new ContextMenuBuilder()
        .addItem(item => item
            .setIcon('select_all')
            .setLabel('Select all')
            .setTooltip('Ctrl + A')
            .setClickHandler(selectAllFiles))
        .addItem(item => item
            .setIcon('select')
            .setLabel('Select none')
            .setTooltip('Ctrl + Shift + A')
            .setClickHandler(deselectAllFiles))
        .addItem(item => item
            .setIcon('move_selection_up')
            .setLabel('Invert selection')
            .setTooltip('Ctrl + Alt + A')
            .setClickHandler(invertFileSelection));
    const rect = btnManageSelection.getBoundingClientRect();
    menu.showAtCoords(rect.left, rect.bottom-5);
});

btnToggleHidden.addEventListener('click', () => {
    showHidden = !showHidden;
    window.localStorage.setItem('showHidden', showHidden);
    elFiles.classList.toggle('showHidden', showHidden);
    setStatus(`${showHidden ? `Showing`:`Hiding`} hidden files`);
});
elFiles.classList.toggle('showHidden', showHidden);

elFiles.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
    elFiles.classList.add('dragover');
});
elFiles.addEventListener('dragleave', e => {
    e.preventDefault();
    e.stopPropagation();
    elFiles.classList.remove('dragover');
});
elFiles.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    elFiles.classList.remove('dragover');
    const files = [];
    for (const file of e.dataTransfer.files) {
        if (file.type !== '') {
            files.push(file);
        }
    }
    uploadFiles(files);
});

window.addEventListener('click', e => {
    const matchIds = [ 'dirControls', 'files', 'fileColHeadings', 'statusBar' ];
    if (!matchIds.includes(e.target.id)) return;
    if (!e.ctrlKey) {
        deselectAllFiles();
    }
});

window.addEventListener('keydown', e => {
    if (document.activeElement.tagName == 'INPUT') return;
    let func = (() => {
        if (e.ctrlKey) {
            if (e.shiftKey) {
                // Ctrl + Shift
                if (e.code === 'Space')
                    return () => connectionManagerDialog();
                if (e.code === 'KeyA')
                    return () => deselectAllFiles();
            }
            if (e.altKey) {
                // Ctrl + Alt
                if (e.code === 'KeyA') {
                    return () => invertFileSelection();
                }
            }
            // Ctrl
            if (e.code === 'KeyX')
                return () => btnSelectionCut.click();
            if (e.code === 'KeyC')
                return () => btnSelectionCopy.click();
            if (e.code === 'KeyV')
                return () => btnSelectionPaste.click();
            if (e.code === 'KeyA')
                return () => selectAllFiles();
            if (e.code === 'KeyR')
                return () => btnGo.click();
        }
        // Shift
        if (e.shiftKey) {
            if (e.code === 'KeyD')
                return () => btnDownload.click();
            if (e.code === 'KeyH')
                return () => btnToggleHidden.click();
            if (e.code === 'KeyN')
                return () => btnDirCreate.click();
            if (e.code === 'KeyU')
                return () => btnUpload.click();
            if (e.code === 'KeyM')
                return () => btnSelectionMove.click();
        }
        // Alt
        if (e.altKey) {
            if (e.code === 'ArrowLeft')
                return () => btnNavBack.click();
            if (e.code === 'ArrowRight')
                return () => btnNavForward.click();
        }
        // No modifiers
        if (e.code === 'F2')
            return () => btnRename.click();
        if (e.code === 'Delete')
            return () => btnSelectionDelete.click();
    })();
    if (func) {
        console.log(`Handling press of ${e.code}`);
        e.preventDefault();
        func();
    }
});

const showMobileWarning = () => new PopupBuilder()
    .setTitle('Laugh at this user!!')
    .addBodyHTML(`
        <p>This site isn't optimized for small screens! To get a real feel for SFTP Browser, resize the window, load it up on a larger display, or rotate your device!</p>
        <p>Mobile optimization is coming soon!</p>
    `)
    .addAction(action => action.setIsPrimary(true).setLabel('Okay'))
    .show();

let shownMobileWarning = false;
window.addEventListener('resize', () => {
    if (window.innerWidth < 800 && !shownMobileWarning) {
        showMobileWarning();
        shownMobileWarning = true;
    }
});

window.addEventListener('load', async() => {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/worker.js');
        console.log('Service Worker registered with scope:', registration.scope);
    }
    const params = new URLSearchParams(window.location.search);
    const connection = connections[params.get('con') || '0'];
    if (connection) {
        setActiveConnection(params.get('con'), params.get('path'));
    } else {
        connectionManagerDialog();
    }
    window.dispatchEvent(new Event('resize'));
});