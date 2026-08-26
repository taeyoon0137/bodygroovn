import csInterface from './CSInterfaceHelper'
import {getSeparator} from './osHelper'
function getNodeBridge() {
    if (!window.__bodygroovnNodeBridge) throw new Error('The bodygroovn Node bridge is not available.')
    return window.__bodygroovnNodeBridge
}

function loadBodymovinFileData(path) {
    var reject, resolve
    var promise = new Promise(function(_resolve, _reject) {
        resolve = _resolve
        reject = _reject
    })
    try {
        var result = window.cep.fs.readFile(path);
        if(result.err === 0) {
            var jsonData = JSON.parse(result.data);
            if (jsonData.v || jsonData.version) {
                resolve(jsonData);
            } else {
                reject()
            }
	    } else {
            console.log(result)
            reject()
        }
    } catch(err) {
        console.log(err)
        reject()
    }

    return promise
}

function loadArrayBuffer(path) {
    return new Promise(function(resolve, reject) {
            try {
                var result = getNodeBridge().readFileSync(path)
                resolve(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength))
            } catch {
                reject()
            }
    })
}

export default loadBodymovinFileData

async function loadFileData(path) {
    var extensionPath = csInterface.getSystemPath('extension');
    var fileStats = getNodeBridge().statSync(extensionPath +  getSeparator() + path)
    return Promise.resolve(fileStats)
    
}

const _localPaths = {}

function getLocalPath(key) {
    return _localPaths[key] || '';
}

function setLocalPath(key, value) {
    _localPaths[key] = value;
}

async function downloadFile(url, path) {
    const res = await fetch(url);

    const arrayBuf = await res.arrayBuffer()
    return new Promise((resolve, reject) => {
        getNodeBridge().writeArrayBuffer(path, arrayBuf, (error) => {
            if(error) {
                reject(error);
            } else {
                resolve();
            }
        })
    })
}

async function saveFileFromBase64(data, path) {
    return new Promise((resolve, reject) => {
        getNodeBridge().writeFile(path, data, 'base64', (error) => {
            if(error) {
                reject(error);
            } else {
                resolve();
            }
        })
    })
}

async function saveTextFile(data, path) {
    return new Promise((resolve, reject) => {
        getNodeBridge().writeFile(path, data, 'utf8', (error) => {
            if(error) {
                reject(error);
            } else {
                resolve();
            }
        })
    })
}

async function getFileType(path) {
    const encodedImageResponse = await fetchWithId('/getType',
    {
        method: 'post',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            path: encodeURIComponent(path),
        })
    })
    const jsonResponse = await readServerResponse(encodedImageResponse)
    return jsonResponse.fileType || { mime: 'font/unn' }

}

async function getEncodedFile(path) {
    const encodedImageResponse = await fetchWithId('/encode',
    {
        method: 'post',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            path: encodeURIComponent(path),
        })
    })
    const jsonResponse = await readServerResponse(encodedImageResponse)
    const fileType = await getFileType(path)
    return `data:${fileType.mime};base64,${jsonResponse.base64}`

}

async function createFolder(path, folderName) {
    if (!getNodeBridge().existsSync(path + folderName)){
        getNodeBridge().mkdirSync(path + folderName);
    }
}

function setTempId() {
    // Compatibility no-op: the Node bridge owns local-server authentication.
}

async function fetchWithId(resource , init = {}) {
    const bridge = getNodeBridge()
    const connection = await bridge.getConnection()
    const url = resource.charAt(0) === '/'
        ? `http://127.0.0.1:${connection.port}${resource}`
        : resource.replace(/^http:\/\/(?:localhost|127\.0\.0\.1):\d+/, `http://127.0.0.1:${connection.port}`)
    const request = {
        ...init,
        headers: {
            ...init.headers,
            'X-Bodygroovn-Token': connection.token,
        }
    }
    return fetch(url, request)
}

async function readServerResponse(response) {
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
        const error = payload && payload.error
        throw new Error(error ? `${error.code}: ${error.message}` : `Local server request failed (${response.status}).`)
    }
    return payload.data
}

export {
    loadFileData,
    getLocalPath,
    setLocalPath,
    downloadFile,
    saveFileFromBase64,
    saveTextFile,
    createFolder,
    loadArrayBuffer,
    getEncodedFile,
    setTempId,
    fetchWithId,
    readServerResponse,
}
