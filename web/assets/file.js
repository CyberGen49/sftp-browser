
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
                elControls.insertAdjacentHTML('beforeend', `
                    <button class="zoomOut btn small secondary iconOnly" title="Zoom out">
                        <div class="icon">zoom_out</div>
                    </button>
                    <div class="zoom">0%</div>
                    <button class="zoomIn btn small secondary iconOnly" title="Zoom in">
                        <div class="icon">zoom_in</div>
                    </button>
                    <div class="sep"></div>
                    <button class="fit btn small secondary iconOnly" title="Fit">
                        <div class="icon">fit_screen</div>
                    </button>
                    <button class="real btn small secondary iconOnly" title="Actual size">
                        <div class="icon">fullscreen</div>
                    </button>
                `);
                const btnZoomOut = $('.btn.zoomOut', elControls);
                const btnZoomIn = $('.btn.zoomIn', elControls);
                const btnFit = $('.btn.fit', elControls);
                const btnReal = $('.btn.real', elControls);
                const elZoom = $('.zoom', elControls);
                let fitPercent = 100;
                const setZoom = percent => {
                    const minZoom = fitPercent;
                    const maxZoom = 1000;
                    const newZoom = Math.min(Math.max(percent, minZoom), maxZoom);
                    elZoom.innerText = `${Math.round(newZoom)}%`;
                    const scaledSize = {
                        width: image.naturalWidth * (newZoom/100),
                        height: image.naturalHeight * (newZoom/100)
                    };
                    image.style.width = `${scaledSize.width}px`;
                    image.style.height = `${scaledSize.height}px`;
                };
                const changeZoom = percentChange => {
                    const zoom = parseInt(elZoom.innerText.replace('%', ''));
                    setZoom(zoom+percentChange);
                };
                const fitImage = () => {
                    const previewRect = elPreview.getBoundingClientRect();
                    const previewRatio = previewRect.width / previewRect.height;
                    const imageRatio = image.naturalWidth / image.naturalHeight;
                    fitPercent = 100;
                    if (imageRatio > previewRatio) {
                        fitPercent = (previewRect.width / image.naturalWidth) * 100;
                    } else {
                        fitPercent = (previewRect.height / image.naturalHeight) * 100;
                    }
                    fitPercent = Math.min(fitPercent, 100);
                    setZoom(fitPercent);
                    image.style.marginTop = '';
                    image.style.marginLeft = '';
                };
                btnZoomIn.addEventListener('click', () => {
                    changeZoom(10);
                });
                btnZoomOut.addEventListener('click', () => {
                    changeZoom(-10);
                });
                btnFit.addEventListener('click', () => {
                    fitImage();
                });
                btnReal.addEventListener('click', () => {
                    setZoom(100);
                });
                elPreview.addEventListener('wheel', e => {
                    if (getIsMobileDevice()) return;
                    e.preventDefault();
                    const previewRect = elPreview.getBoundingClientRect();
                    const relativePos = {
                        x: (e.clientX - previewRect.left) + elPreview.scrollLeft,
                        y: (e.clientY - previewRect.top) + elPreview.scrollTop
                    };
                    const percentage = {
                        x: relativePos.x / elPreview.scrollWidth,
                        y: relativePos.y / elPreview.scrollHeight
                    };
                    changeZoom(e.deltaY > 0 ? -10 : 10);
                    const newScroll = {
                        x: (elPreview.scrollWidth * percentage.x) - relativePos.x,
                        y: (elPreview.scrollHeight * percentage.y) - relativePos.y
                    };
                    elPreview.scrollLeft += newScroll.x;
                    elPreview.scrollTop += newScroll.y;
                });
                /*
                let startTouchDistance = 0;
                elPreview.addEventListener('touchstart', e => {
                    if (!getIsMobileDevice()) return;
                    if (e.touches.length == 2) {
                        e.preventDefault();
                        const touch1 = e.touches[0];
                        const touch2 = e.touches[1];
                        const distance = Math.sqrt(
                            Math.pow(touch1.clientX - touch2.clientX, 2) +
                            Math.pow(touch1.clientY - touch2.clientY, 2)
                        );
                        startTouchDistance = distance;
                    }
                });
                elPreview.addEventListener('touchmove', e => {
                    if (!getIsMobileDevice()) return;
                    if (e.touches.length == 2) {
                        e.preventDefault();
                        const touch1 = e.touches[0];
                        const touch2 = e.touches[1];
                        const distance = Math.sqrt(
                            Math.pow(touch1.clientX - touch2.clientX, 2) +
                            Math.pow(touch1.clientY - touch2.clientY, 2)
                        );
                        const percentChange = (distance - startTouchDistance) / 10;
                        changeZoom(percentChange);
                        startTouchDistance = distance;
                    }
                });
                elPreview.addEventListener('touchend', e => {
                    if (!getIsMobileDevice()) return;
                    startTouchDistance = 0;
                });
                */
                let startCoords = {};
                let startScroll = {};
                let isMouseDown = false;
                elPreview.addEventListener('mousedown', e => {
                    if (getIsMobileDevice()) return;
                    e.preventDefault();
                    startCoords = { x: e.clientX, y: e.clientY };
                    startScroll = { x: elPreview.scrollLeft, y: elPreview.scrollTop };
                    isMouseDown = true;
                    elPreview.style.cursor = 'grabbing';
                });
                elPreview.addEventListener('dragstart', e => {
                    if (getIsMobileDevice()) return;
                    e.preventDefault();
                });
                elPreview.addEventListener('mousemove', e => {
                    if (getIsMobileDevice()) return;
                    e.preventDefault();
                    if (!isMouseDown) return;
                    const newScroll = {
                        x: startCoords.x - e.clientX + startScroll.x,
                        y: startCoords.y - e.clientY + startScroll.y
                    };
                    // Update preview scroll
                    elPreview.scrollLeft = newScroll.x;
                    elPreview.scrollTop = newScroll.y;
                });
                elPreview.addEventListener('mouseup', e => {
                    if (getIsMobileDevice()) return;
                    e.preventDefault();
                    isMouseDown = false;
                    elPreview.style.cursor = '';
                });
                elPreview.addEventListener('mouseleave', e => {
                    if (getIsMobileDevice()) return;
                    e.preventDefault();
                    isMouseDown = false;
                    elPreview.style.cursor = '';
                });
                elControls.style.display = '';
                elPreview.innerHTML = '';
                elPreview.appendChild(image);
                statusHtmlSegments.push(`<span>${image.naturalWidth}x${image.naturalHeight}</span>`);
                fitImage();
                window.addEventListener('resize', fitImage);
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
                // Initialize the textarea
                const text = await (await fetch(fileUrl)).text();
                //const textarea = document.createElement('textarea');
                // Initialize CodeMirror
                elPreview.innerHTML = '';
                const editor = CodeMirror(elPreview, {
                    value: text,
                    lineNumbers: true,
                    lineWrapping: true,
                    scrollPastEnd: true,
                    styleActiveLine: true,
                    autoCloseBrackets: true,
                    mode: extInfo.codeMirrorMode
                });
                const elEditor = $('.CodeMirror', elPreview);
                // Load CodeMirror mode
                if (extInfo.codeMirrorMode) {
                    let mode;
                    CodeMirror.requireMode(extInfo.codeMirrorMode, () => {}, {
                        path: determinedMode => {
                            mode = determinedMode;
                            return `https://codemirror.net/5/mode/${determinedMode}/${determinedMode}.js`;
                        }
                    });
                    CodeMirror.autoLoadMode(editor, mode);
                }
                // Add HTML
                elControls.insertAdjacentHTML('beforeend', `
                    <button class="save btn small secondary" disabled>
                        <div class="icon">save</div>
                        <span>Save</span>
                    </button>
                    <button class="view btn small secondary" style="display: none">
                        <div class="icon">visibility</div>
                        <span>View</span>
                    </button>
                    <button class="edit btn small secondary" style="display: none">
                        <div class="icon">edit</div>
                        <span>Edit</span>
                    </button>
                    <div class="sep"></div>
                    <button class="textSmaller btn small secondary iconOnly">
                        <div class="icon">text_decrease</div>
                    </button>
                    <div class="textSize">18</div>
                    <button class="textBigger btn small secondary iconOnly">
                        <div class="icon">text_increase</div>
                    </button>
                    <div class="sep"></div>
                    <label class="selectOption">
                        <input type="checkbox">
                        <span>Word wrap</span>
                    </label>
                `);
                // Set up the save button
                const btnSave = $('.btn.save', elControls);
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
                    if (e.ctrlKey && e.code == 'KeyS') {
                        e.preventDefault();
                        btnSave.click();
                    }
                    if (e.ctrlKey && e.code == 'Minus') {
                        e.preventDefault();
                        btnTextSmaller.click();
                    }
                    if (e.ctrlKey && e.code == 'Equal') {
                        e.preventDefault();
                        btnTextBigger.click();
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
                    const btnPreview = $('.btn.view', elControls);
                    const btnEdit = $('.btn.edit', elControls);
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
                // Set up text size buttons
                const btnTextSmaller = $('.btn.textSmaller', elControls);
                const btnTextBigger = $('.btn.textBigger', elControls);
                const elTextSize = $('.textSize', elControls);
                let size = parseInt(window.localStorage.getItem('textEditorSize')) || 18;
                const updateTextSize = () => {
                    //textarea.style.fontSize = `${size}px`;
                    elEditor.style.fontSize = `${size}px`;
                    elTextSize.innerText = size;
                    window.localStorage.setItem('textEditorSize', size);
                }
                updateTextSize();
                btnTextSmaller.addEventListener('click', () => {
                    size--;
                    updateTextSize();
                });
                btnTextBigger.addEventListener('click', () => {
                    size++;
                    updateTextSize();
                });
                // Finalize elements
                elControls.style.display = '';
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