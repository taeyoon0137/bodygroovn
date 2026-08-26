import csInterface, {
	sendAsyncCommand,
	sendCommandWithListeners,
	getXMPValue,
} from './CSInterfaceHelper'
import extensionLoader from './ExtensionLoader'
import {dispatcher} from './storeDispatcher'
import actions from '../redux/actions/actionTypes'
import {versionFetched, appVersionFetched} from '../redux/actions/generalActions'
import {reportsSaved, reportsSaveFailed} from '../redux/actions/reportsActions'
import {processExpression} from '../redux/actions/renderActions'
import {splitAnimation} from './splitAnimationHelper'
import { getSimpleSeparator } from './osHelper'

csInterface.addEventListener('bm:compositions:list', function (ev) {
	if(ev.data) {
		let compositions = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		dispatcher({ 
				type: actions.COMPOSITIONS_UPDATED,
				compositions: compositions
		})
	} else {
	}
})

csInterface.addEventListener('bm:render:complete', function (ev) {
	//console.log('COMPLETE RENDER')
	if(ev.data) {
		let id = ev.data
		dispatcher({ 
				type: actions.RENDER_COMPLETE,
				id: id
		})
	} else {
	}
})

csInterface.addEventListener('bm:render:start', function (ev) {
	/*if(ev.data) {
		let id = ev.data
		dispatcher({ 
				type: actions.RENDER_COMPLETE,
				id: id
		})
	} else {
	}*/
	//console.log('STARTED RENDER')
})

csInterface.addEventListener('console:log', function (ev) {
	console.log('LOGGING:', ev.data)
		dispatcher({ 
				type: actions.GENERAL_LOG,
				data: ev.data
		})
})

csInterface.addEventListener('bm:render:update', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		dispatcher({ 
				type: actions.RENDER_UPDATE,
				data: data
		})
	} else {
	}
})

csInterface.addEventListener('bm:render:fonts', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		if(typeof data.fonts === "string") {
			data.fonts = JSON.parse(data.fonts)
		}
		dispatcher({ 
				type: actions.RENDER_FONTS,
				data: data
		})
		//browserHistory.push('/fonts')
	} else {
	}
})

csInterface.addEventListener('bm:image:process', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		
		// Fix boolean values returned as strings by older After Effects versions.
		if(data && data.should_encode_images === 'false') {
			data.should_encode_images = false
		}
		if(data && typeof data.png_palette_colors === 'string') {
			data.png_palette_colors = Number(data.png_palette_colors)
		}

		dispatcher({ 
				type: actions.RENDER_PROCESS_IMAGE,
				data: data
		})
		//browserHistory.push('/fonts')
	} else {
	}
})

csInterface.addEventListener('bm:project:id', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		const id = data.id
		const name = data.name
		dispatcher({ 
				type: actions.PROJECT_SET_ID,
				id: id,
				name: name,
		})
	} else {
	}
})

csInterface.addEventListener('bm:temp:id', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		let id = data.id
		dispatcher({ 
				type: actions.PROJECT_SET_TEMP_ID,
				id: id
		})
	} else {
	}
})

csInterface.addEventListener('bm:project:path', function (ev) {

	if (ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		let path = data.path
		dispatcher({ 
				type: actions.PROJECT_SET_PATH,
				path: path
		})
	}
})

csInterface.addEventListener('bm:composition:destination_set', async function (ev) {
	try {
		if (!ev.data) {
			throw new Error('Missing composition destination data')
		}
		const compositionData = (typeof ev.data === 'string') ? JSON.parse(ev.data) : ev.data
		await window.__bodygroovnNodeBridge.setExportDestination(compositionData.destination)
		dispatcher({
			type: actions.COMPOSITION_SET_DESTINATION,
			compositionData,
		})
	} catch (error) {
		dispatcher({
			type: actions.WRITE_ERROR,
			pars: [error.message || 'Could not register the export destination.'],
		})
	}
})

csInterface.addEventListener('bm:alert', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		dispatcher({ 
				type: actions.WRITE_ERROR,
				pars: data.message.split('<br />')
		})
	} else {
	}
})

csInterface.addEventListener('bm:version', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		dispatcher(versionFetched(data.value))
	} else {
	}
})

csInterface.addEventListener('app:version', function (ev) {
	if(ev.data) {
		let data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
		dispatcher(appVersionFetched(data.value))
	} else {
	}
})

csInterface.addEventListener('bm:split:animation', async function (ev) {
	try {
		if(ev.data) {
			const data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
			////
			const splitResponse = await splitAnimation(data.origin, data.destination, data.fileName, data.time);
			csInterface.evalScript('$.__bodymovin.bm_standardExporter.splitSuccess(' + splitResponse + ')');
		} else {
			throw new Error('Missing data')
		}
	} catch(err) {
		csInterface.evalScript('$.__bodymovin.bm_standardExporter.splitFailed()');
	}
})

csInterface.addEventListener('bm:report:saved', async function (ev) {
	try {
		if(ev.data) {
			const data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
			////
			dispatcher(reportsSaved(data.compId, data.reportPath));
		} else {
			throw new Error('Missing data')
		}
	} catch(err) {
		dispatcher(reportsSaveFailed(null, err.message))
	}
})

csInterface.addEventListener('bm:report:save:failed', function (ev) {
	try {
		const data = ev.data
			? ((typeof ev.data === 'string') ? JSON.parse(ev.data) : ev.data)
			: {}
		dispatcher(reportsSaveFailed(data.compId, data.message))
	} catch (err) {
		dispatcher(reportsSaveFailed(null, err.message))
	}
})

csInterface.addEventListener('bm:expression:process', async function (ev) {
	let data
	try {
		if(ev.data) {
			data = (typeof ev.data === "string") ? JSON.parse(ev.data) : ev.data
			if (!data || typeof data.id !== 'string' || !data.id || typeof data.text !== 'string') {
				throw new Error('Malformed expression request')
			}
			dispatcher(processExpression(data));
		} else {
			throw new Error('Missing data')
		}
	} catch(err) {
		if (data && typeof data.id === 'string' && data.id) {
			expressionProcessed(data.id, {hasFailed: true}, data.render_generation)
		} else {
			const generation = data && Number.isInteger(data.render_generation)
				? data.render_generation
				: 'undefined'
			csInterface.evalScript('$.__bodymovin.bm_renderManager.expressionProcessingFailed(' + generation + ')')
		}
	}
})

function getCompositions() {
	return new Promise(function(resolve, reject){
		extensionLoader.then(function(){
			csInterface.evalScript('$.__bodymovin.bm_compsManager.updateData()');
			resolve();
		})
	})
}

function createTempIdHeader() {
	return new Promise(function(resolve, reject){
		extensionLoader.then(function(){
			csInterface.evalScript('$.__bodymovin.bm_projectManager.createTempId()');
			resolve();
		})
	})
}

function getProjectPath() {
	let prom = new Promise(function(resolve, reject){
		extensionLoader.then(function(){
			csInterface.evalScript('$.__bodymovin.bm_projectManager.getProjectPath()');
			resolve();
		})
	})
	return prom
}

function getDestinationPath(comp, alternatePath, shouldUseCompNameAsDefault) {
	let destinationPath = ''
	const fileName = shouldUseCompNameAsDefault ? comp.name : 'data'
	if(comp.absoluteURI) { 
		destinationPath = comp.absoluteURI
	} else if(alternatePath) {
		alternatePath = alternatePath.split('\\').join('\\\\')
		const delimiter = getSimpleSeparator()
		if (alternatePath.charAt(alternatePath.length - 1) !== delimiter) {
			alternatePath += delimiter;
		}
		alternatePath += fileName
		if(comp.settings.export_modes.standalone) {
			alternatePath += '.js'
		} else {
			alternatePath += '.json'
		}
		destinationPath = alternatePath
	}
	var extension = 'json'
	if (comp.settings.export_modes.standalone) {
		extension = 'js'
	}
	extensionLoader.then(function(){
		var eScript = '$.__bodymovin.bm_compsManager.searchCompositionDestination(' + comp.id + ',"' + destinationPath+ '","' + (fileName + '.' + extension) + '")'
		csInterface.evalScript(eScript)
	})
	let prom = new Promise(function(resolve, reject){
		resolve()
	})
	return prom
}

async function renderNextComposition(comp) {
	if (!window.__bodygroovnNodeBridge) {
		throw new Error('The bodygroovn Node bridge is not available.');
	}
	await window.__bodygroovnNodeBridge.setExportDestination(comp.destination)
	await extensionLoader
	var eScript = '$.__bodymovin.bm_compsManager.renderComposition(' + JSON.stringify(comp) + ')'
	csInterface.evalScript(eScript)
}

function stopRenderCompositions() {
	extensionLoader.then(function(){
		var eScript = '$.__bodymovin.bm_compsManager.cancel()'
		csInterface.evalScript(eScript)
	})
	let prom = new Promise(function(resolve){
		resolve()
	})
	return prom
}

function setFonts(fontsInfo, generation) {
	let prom = new Promise(function(resolve, reject){
		resolve()
	})
	var fontsInfoString = JSON.stringify({list:fontsInfo})
	var renderGeneration = Number.isInteger(generation) ? generation : 'undefined'

	extensionLoader.then(function(){
	    var eScript = '$.__bodymovin.bm_renderManager.setFontData(' + fontsInfoString + ',' + renderGeneration + ')'
	    csInterface.evalScript(eScript)
	})
	return prom
}

function openInBrowser(url) {
	csInterface.openURLInDefaultBrowser(url)
	//csInterface.openURLInDefaultBrowser(url);
}

function getPlayer(gzipped) {
	let gzippedString = gzipped ? 'true' : 'false'
	extensionLoader.then(function(){
		var eScript = '$.__bodymovin.bm_downloadManager.getPlayer(' + gzippedString + ')';
	    csInterface.evalScript(eScript);
	})
}

function goToFolder(path) {
	extensionLoader.then(function(){
		var eScript = '$.__bodymovin.bm_compsManager.browseFolder("' + path.split('\\').join('\\\\') + '")';
	    csInterface.evalScript(eScript);
	})
}

function getVersionFromExtension() {
	let prom = new Promise(function(resolve, reject){
		resolve()
	})
	extensionLoader.then(function(){
		var eScript = '$.__bodymovin.bm_renderManager.getVersion()';
	    csInterface.evalScript(eScript);
	})
	return prom
}

function imageProcessed(result, data) {
	extensionLoader.then(function(){
		var eScript = ''
		const generation = Number.isInteger(data.render_generation) ? data.render_generation : null
		if (generation !== null) {
			eScript += 'if ($.__bodymovin.bm_renderManager.isRenderActive(' + generation + ')) {'
		}
		if(data.assetType === 'audio') {
			eScript += '$.__bodymovin.bm_audioSourceHelper.assetProcessed(';

		} else {
			eScript += '$.__bodymovin.bm_sourceHelper.imageProcessed(';
		}
		eScript += 'false';
		eScript += ',';
		if(result.encoded) {
			eScript += '"' + result.encoded_data + '"'
		} else {
			eScript += 'null';
		}
		eScript += ')';
		if (generation !== null) {
			eScript += '}'
		}
	    csInterface.evalScript(eScript);
	})
}

function imageProcessingFailed(message, generation) {
	extensionLoader.then(function(){
		var eScript = '$.__bodymovin.bm_renderManager.imageProcessingFailed(' + JSON.stringify(message || 'Image processing failed.') + ',' + (Number.isInteger(generation) ? generation : 'undefined') + ')';
		csInterface.evalScript(eScript);
	})
}

async function initializeServer() {
	if (!window.__bodygroovnNodeBridge) {
		throw new Error('The bodygroovn Node bridge is not available.');
	}
	await window.__bodygroovnNodeBridge.getConnection();
}

async function restartServer() {
	if (!window.__bodygroovnNodeBridge) {
		throw new Error('The bodygroovn Node bridge is not available.');
	}
	await window.__bodygroovnNodeBridge.restart();
}

function navigateToLayer(compositionId, layerIndex) {
	extensionLoader.then(function(){
		var eScript = `
		$.__bodymovin.bm_compsManager.navigateToLayer(${compositionId},${layerIndex})
	    `
	    csInterface.evalScript(eScript);
	})
}

async function getCompositionTimelinePosition() {
	return sendCommandWithListeners(
		'$.__bodymovin.bm_compsManager.getTimelinePosition',
		[],
		'bm:composition:timelinePosition',
		''
	);
}

async function setCompositionTimelinePosition(progress) {
	return sendAsyncCommand(
		'$.__bodymovin.bm_compsManager.setTimelinePosition',
		[progress],
	)
	
}

function expressionProcessed(id, data, generation) {
	sendAsyncCommand(
		'$.__bodymovin.bm_expressionHelper.saveExpression',
		[data, id, generation],
	)
}

async function getUserFolders() {
	return sendCommandWithListeners(
		'$.__bodymovin.bm_projectManager.getUserFolders',
		[],
		'bm:user:folders',
		''
	)
}

async function getSavingPath(path) {
	return sendCommandWithListeners(
		'$.__bodymovin.bm_projectManager.setDestinationPath',
		[
			path,
		],
		'bm:destination:selected',
		'bm:destination:cancelled'
	)
}

async function saveProjectDataToXMP(data) {
	return new Promise(async function(resolve, reject) {
		var eScript = '$.__bodymovin.bm_XMPHelper.setMetadata("config", \'' + JSON.stringify(data) + '\')';
		csInterface.evalScript(eScript);
		setStorageLocation('xmp');
		resolve();
	})
}

async function getProjectDataFromXMP() {
	return getXMPValue(
		"config",
		true,
	)
}

async function setStorageLocation(location) {
	return sendAsyncCommand(
		'$.__bodymovin.bm_XMPHelper.setMetadata',
		["storageLocation", location],
	)
}

async function getStorageLocation() {
	return getXMPValue(
		"storageLocation",
		false,
	)
}

async function getCompressedState() {
	try {
		const isCompressed = await getXMPValue(
			"isCompressed",
			false,
		)
		return isCompressed;
	} catch (error) {
		return false;
	}
}

async function setCompressedState(value) {
	return sendAsyncCommand(
		'$.__bodymovin.bm_XMPHelper.setMetadata',
		["isCompressed", value],
	)
}

export {
	getCompositions,
	getDestinationPath,
	renderNextComposition,
	stopRenderCompositions,
	setFonts,
	openInBrowser,
	getPlayer,
	goToFolder,
	getVersionFromExtension,
	imageProcessed,
	imageProcessingFailed,
	initializeServer,
	restartServer,
	getProjectPath,
	navigateToLayer,
	getCompositionTimelinePosition,
	setCompositionTimelinePosition,
	getUserFolders,
	expressionProcessed,
	getSavingPath,
	saveProjectDataToXMP,
	getProjectDataFromXMP,
	setStorageLocation,
	getStorageLocation,
	getCompressedState,
	setCompressedState,
	createTempIdHeader,
}
