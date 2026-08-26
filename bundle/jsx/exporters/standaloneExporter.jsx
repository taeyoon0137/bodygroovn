/*jslint vars: true , plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global File, Folder, $*/

$.__bodymovin.bm_standaloneExporter = (function () {

	var bm_fileManager = $.__bodymovin.bm_fileManager;
	var exporterHelpers = $.__bodymovin.bm_exporterHelpers;
	var bm_downloadManager = $.__bodymovin.bm_downloadManager;
    var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
	var _callback;
	var ob = {}

	function finish(status) {
		if (_callback) {
			var callback = _callback;
			_callback = null;
			callback(exporterHelpers.exportTypes.STANDALONE, status);
		}
	}

	function save(destinationPath, config, callback) {
		_callback = callback;
		var transaction = exporterHelpers.createTransaction();
		try {

		if (config.export_modes.standalone) {
			var destinationData = exporterHelpers.parseDestination(destinationPath, 'standalone');

			var destinationFile = new File(destinationData.folder.fsName);
			destinationFile.changePath(destinationData.fileName + '.js');

			var rawFiles = bm_fileManager.getFilesOnPath(['raw']);
			var animationStringData = exporterHelpers.getJsonData(rawFiles);

		    var bodymovinJsStr = bm_downloadManager.getStandaloneData();
		    animationStringData = bodymovinJsStr.replace("\"__[ANIMATIONDATA]__\"",  animationStringData );
		    animationStringData = animationStringData.replace("\"__[STANDALONE]__\"", 'true');
		    
			exporterHelpers.saveAssets(rawFiles, destinationData.folder, transaction);

			exporterHelpers.writeTextFile(destinationFile, animationStringData, transaction); //DO NOT ERASE, JSON UNFORMATTED
			//destinationFile.write(JSON.stringify(ob.renderData.exportData, null, '  ')); //DO NOT ERASE, JSON FORMATTED
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
