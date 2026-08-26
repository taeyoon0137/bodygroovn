/*jslint vars: true , plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global File, Folder, $*/

$.__bodymovin.bm_demoExporter = (function () {

    var bm_downloadManager = $.__bodymovin.bm_downloadManager;
    var exporterHelpers = $.__bodymovin.bm_exporterHelpers;
    var bm_fileManager = $.__bodymovin.bm_fileManager;
    var JSON = $.__bodymovin.JSON;
	var ob = {}
	var _callback;

	function finish(status) {
		if (_callback) {
			var callback = _callback;
			_callback = null;
			callback(exporterHelpers.exportTypes.DEMO, status);
		}
	}

	function save(destinationPath, config, callback, data) {

		_callback = callback;
		var transaction = exporterHelpers.createTransaction();
		try {

		if (config.export_modes.demo) {

			var destinationData = exporterHelpers.parseDestination(destinationPath, 'demo');

			var rawFiles = bm_fileManager.getFilesOnPath(['raw']);

			exporterHelpers.saveAssets(rawFiles, destinationData.folder, transaction)

	        // var fullFilePathName = destinationPath.substr(destinationPath.lastIndexOf('/') + 1);

			var animationStringData = exporterHelpers.getJsonData(rawFiles);

			var demoStr = bm_downloadManager.getDemoData();
			demoStr = demoStr.replace('"__[[ANIMATIONDATA]]__"', "" + animationStringData + "");
			if(data.ddd) {
			    demoStr = demoStr.replace('__[[RENDERER]]__', "html");
			} else {
			    demoStr = demoStr.replace('__[[RENDERER]]__', "svg");
			}
			var color = config.demoData.backgroundColor || '#FFF';
			demoStr = demoStr.replace('__[[BODY_BACKGROUND_COLOR]]__', color);
			demoStr = demoStr.replace('__[[LOTTIE_BACKGROUND_COLOR]]__', color);

			var demoDestinationFile = new File(destinationData.folder.fsName);
			demoDestinationFile.changePath(destinationData.fileName + '.html');
			exporterHelpers.writeTextFile(demoDestinationFile, demoStr, transaction); //DO NOT ERASE, JSON UNFORMATTED
			exporterHelpers.commitTransaction(transaction);
			finish(exporterHelpers.exportStatuses.SUCCESS);
		} else {
			finish(exporterHelpers.exportStatuses.SUCCESS);
		}
		} catch (error) {
			try {
				exporterHelpers.rollbackTransaction(transaction);
			} catch (rollbackError) {
				// Preserve failed completion even if Adobe cannot restore a destination.
			} finally {
				finish(exporterHelpers.exportStatuses.FAILED);
			}
		}
	}

	ob.save = save;
    
    return ob;
}());
