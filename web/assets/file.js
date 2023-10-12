
const elNavBar = $('#navbar');
const elControls = $('#controls');
const elPreview = $('#preview');
const btnDownload = $('#download');
const query = new URLSearchParams(window.location.search);
let path = query.get('path');
activeConnection = connections[query.get('con')];
let fileStats = null;

const updatePreview = async() => {
    // Make sure the file is viewable
    const extInfo = getFileExtInfo(path);
    if (!extInfo.isViewable) {
        return setStatus(`Error: File isn't viewable!`, true);
    }
    let fileUrl;
    try {
        const startTime = Date.now();
        let lastUpdate = 0;
        const blob = await api.request('get', 'files/get/single', {
            path: path
        }, null, e => {
            if ((Date.now()-lastUpdate) < 100) return;
            lastUpdate = Date.now();
            const progress = Math.round((e.loaded / fileStats.size) * 100);
            const bps = Math.round(e.loaded / ((Date.now() - startTime) / 1000));
            setStatus(`Downloaded ${formatSize(e.loaded)} of ${formatSize(fileStats.size)} (${formatSize(bps)}/s)`, false, progress);
        }, 'blob');
        fileUrl = URL.createObjectURL(blob);
    } catch (error) {
        return setStatus(`Error: ${error}`, true);
    }
    if (extInfo.isViewable) {
        elPreview.classList.add(extInfo.type);
        const statusHtmlSegments = [];
        switch (extInfo.type) {
            case 'image': {
                const image = document.createElement('img');
                image.src = fileUrl;
                await new Promise(resolve => {
                    image.addEventListener('load', resolve);
                });
                elPreview.innerHTML = '';
                elPreview.appendChild(image);
                statusHtmlSegments.push(`<span>${image.naturalWidth}x${image.naturalHeight}</span>`);
                break;
            }
            case 'video': {
                const video = document.createElement('video');
                video.src = fileUrl;
                await new Promise(resolve => {
                    video.addEventListener('loadedmetadata', resolve);
                });
                video.controls = true;
                elPreview.innerHTML = '';
                elPreview.appendChild(video);
                video.play();
                statusHtmlSegments.push(`<span>${formatSeconds(video.duration)}</span>`);
                statusHtmlSegments.push(`<span>${video.videoWidth}x${video.videoHeight}</span>`);
                break;
            }
            case 'audio': {
                const audio = document.createElement('audio');
                audio.src = fileUrl;
                await new Promise(resolve => {
                    audio.addEventListener('loadedmetadata', resolve);
                });
                audio.controls = true;
                elPreview.innerHTML = '';
                elPreview.appendChild(audio);
                audio.play();
                statusHtmlSegments.push(`<span>${formatSeconds(audio.duration)}</span>`);
                break;
            }
            case 'markdown':
            case 'text': {
                elControls.style.display = '';
                elPreview.innerHTML = '';
                // Initialize the textarea
                const text = await (await fetch(fileUrl)).text();
                //const textarea = document.createElement('textarea');
                // Initialize CodeMirror
                const editor = CodeMirror(elPreview, {
                    value: text,
                    lineNumbers: true,
                    lineWrapping: true,
                    scrollPastEnd: true,
                    mode: extInfo.codeMirrorMode
                });
                const elEditor = $('.CodeMirror', elPreview);
                // Add HTML
                elControls.insertAdjacentHTML('beforeend', `
                    <button class="btn small secondary" disabled>
                        <div class="icon">save</div>
                        <span>Save</span>
                    </button>
                    ${extInfo.type == 'markdown' ? `
                        <button class="btn small secondary" style="display: none">
                            <div class="icon">visibility</div>
                            <span>View</span>
                        </button>
                        <button class="btn small secondary" style="display: none">
                            <div class="icon">edit</div>
                            <span>Edit</span>
                        </button>
                    `:''}
                    <div class="sep"></div>
                    <label class="selectOption">
                        <input type="checkbox">
                        <span>Word wrap</span>
                    </label>
                `);
                // Set up the save button
                const btnSave = $('.btn:nth-of-type(1)', elControls);
                const btnSaveName = $('span', btnSave);
                btnSave.addEventListener('click', async() => {
                    btnSaveName.innerText = 'Saving...';
                    btnSave.disabled = true;
                    btnSave.classList.remove('info');
                    const res1 = await api.delete('files/delete', {
                        path: path
                    });
                    const res2 = await api.post('files/create', {
                        path: path
                    //}, textarea.value);
                    }, editor.getValue());
                    if (res1.error || res2.error) {
                        console.error(e);
                        btnSaveName.innerText = 'Failed!!';
                    } else {
                        btnSaveName.innerText = 'Saved!';
                        getUpdatedStats();
                    }
                });
                //textarea.addEventListener('input', () => {
                editor.on('change', () => {
                    btnSave.disabled = false;
                    btnSave.classList.add('info');
                    btnSaveName.innerText = 'Save';
                });
                window.addEventListener('keydown', e => {
                    if (e.ctrlKey && e.key == 's') {
                        e.preventDefault();
                        btnSave.click();
                    }
                });
                window.addEventListener('beforeunload', e => {
                    if (!btnSave.disabled) {
                        e.preventDefault();
                        e.returnValue = '';
                    }
                });
                // Set up the word wrap checkbox
                const wrapCheckbox = $('input[type="checkbox"]', elControls);
                wrapCheckbox.addEventListener('change', () => {
                    const isChecked = wrapCheckbox.checked;
                    //textarea.style.whiteSpace = isChecked ? 'pre-wrap' : 'pre';
                    editor.setOption('lineWrapping', isChecked);
                    window.localStorage.setItem('wrapTextEditor', isChecked);
                });
                wrapCheckbox.checked = window.localStorage.getItem('wrapTextEditor') == 'true';
                wrapCheckbox.dispatchEvent(new Event('change'));
                // Set up markdown controls
                let elRendered;
                if (extInfo.type == 'markdown') {
                    elRendered = document.createElement('div');
                    elRendered.classList = 'rendered';
                    elRendered.style.display = 'none';
                    const btnPreview = $('.btn:nth-of-type(2)', elControls);
                    const btnEdit = $('.btn:nth-of-type(3)', elControls);
                    // Set up the markdown preview button
                    btnPreview.addEventListener('click', async() => {
                        btnPreview.style.display = 'none';
                        btnEdit.style.display = '';
                        elRendered.style.display = '';
                        //textarea.style.display = 'none';
                        elEditor.style.display = 'none';
                        //elRendered.innerHTML = marked.parse(textarea.value);
                        elRendered.innerHTML = marked.parse(editor.getValue());
                        // Make all links open in a new tab
                        const links = $$('a', elRendered);
                        for (const link of links) {
                            link.target = '_blank';
                        }
                    });
                    // Set up the markdown edit button
                    btnEdit.addEventListener('click', async() => {
                        btnPreview.style.display = '';
                        btnEdit.style.display = 'none';
                        elRendered.style.display = 'none';
                        //textarea.style.display = '';
                        elEditor.style.display = '';
                    });
                    // View file by default
                    btnEdit.click();
                }
                //elPreview.appendChild(textarea);
                if (extInfo.type == 'markdown')
                    elPreview.appendChild(elRendered);
                break;
            }
            default: {
                elPreview.innerHTML = `<h1 class="text-danger">Error!</h1>`;
                break;
            }
        }
        const setStatusWithDetails = () => {
            setStatus(`
                <div class="row flex-wrap" style="gap: 2px 20px">
                    <span>${formatSize(fileStats.size)}</span>
                    ${statusHtmlSegments.join('\n')}
                    <span>${extInfo.mime}</span>
                    <span>${getRelativeDate(fileStats.modifyTime)}</span>
                </div>
            `)
        };
        setStatusWithDetails();
        setTimeout(setStatusWithDetails, 5000);
    }
}

const getUpdatedStats = async() => {
    // Stat file
    const res = await api.get('files/stat', {
        path: path
    });
    fileStats = res.stats;
    return res;
}

window.addEventListener('load', async() => {
    const res = await getUpdatedStats();
    if (!res.error) {
        // Update navbar
        path = res.path;
        document.title = `${activeConnection.name} - ${path}`;
        const pathSplit = path.split('/');
        const folderPath = `${pathSplit.slice(0, pathSplit.length - 1).join('/')}/`;
        const fileName = pathSplit[pathSplit.length - 1];
        $('.path', elNavBar).innerText = folderPath;
        $('.name', elNavBar).innerText = fileName;
        updatePreview(fileName);
    } else {
        return setStatus(`Error: ${res.error}`, true);
    }
});

btnDownload.addEventListener('click', async() => {
    const fileName = $('.name', elNavBar).innerText;
    const elSrc = $('img, video, audio', elPreview);
    const elText = $('textarea', elPreview);
    if (elSrc) {
        console.log(`Starting download using downloaded blob`);
        return downloadUrl(elSrc.src, fileName);
    } else if (elText) {
        console.log(`Starting download using textarea value`);
        const dataUrl = `data:text/plain;base64,${btoa(elText.value)}`;
        return downloadUrl(dataUrl, fileName);
    } else {
        console.log(`Starting download using URL API`);
        const url = await getFileDownloadUrl(path)
        downloadUrl(url);
    }
});

// Let the window finish displaying itself before saving size
setTimeout(() => {
    window.addEventListener('resize', () => {
        window.localStorage.setItem('viewerWidth', window.innerWidth);
        window.localStorage.setItem('viewerHeight', window.innerHeight);
    });
}, 2000);