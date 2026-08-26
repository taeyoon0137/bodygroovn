/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global $, Folder, File, app */

$.__bodymovin.bm_layerCollectionReport = (function () {
    
    var layerReportHelper = $.__bodymovin.bm_layerReportHelper;
    var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
    var scheduledMethods = {};
    var scheduledMethodId = 0;

    function runScheduledMethod(id) {
        var method = scheduledMethods[id];
        delete scheduledMethods[id];
        if (method) {
            method();
        }
    }

    function LayerCollection(layers, onComplete, onFail, isActive) {
        this.layers = layers;
        this.collection = [];
        this.currentLayerIndex = 0;
        this._onComplete = onComplete;
        this._onFail = onFail;
        this._isActive = isActive || function () { return true; };
        this.onLayerComplete = this.onLayerComplete.bm_bind(this);
        this.onLayerFailed = this.onLayerFailed.bm_bind(this);
        this.processCurrentLayer = this.processCurrentLayer.bm_bind(this);
    }

    LayerCollection.prototype.process = function() {
        if (!this._isActive()) {
            return;
        }
        var layers = this.layers;
        var collection = this.collection;
        var i, len = layers.length;
        var layer;
        for (i = 0; i < len; i += 1) {
            layer = layers[i + 1];
            collection.push(layerReportHelper.createLayer(layer, this.onLayerComplete, this.onLayerFailed));
        }
        this.asynchronouslyProcessCurrentLayer();
    }
    
    LayerCollection.prototype.processCurrentLayer = function() {
        if (!this._isActive()) {
            return;
        }
        try {
            var currentLayer = this.collection[this.currentLayerIndex];
            if (currentLayer) {
                currentLayer.process();
            } else {
                this._onComplete();
            }
        } catch(error) {
            this._onFail(error);
        }
    }

    LayerCollection.prototype.asynchronouslyProcessCurrentLayer = function() {
        if (!this._isActive()) {
            return;
        }
        scheduledMethodId += 1;
        scheduledMethods[scheduledMethodId] = this.processCurrentLayer;
        app.scheduleTask('$.__bodymovin.bm_layerCollectionReport.runScheduledMethod(' + scheduledMethodId + ');', 20, false);
    }

    LayerCollection.prototype.onLayerFailed = function(error) {
        if (!this._isActive()) {
            return;
        }
        if (error) {
            bm_eventDispatcher.log(error.message);
            bm_eventDispatcher.log(error.line);
            bm_eventDispatcher.log(error.fileName);
        }
        bm_eventDispatcher.log($.stack);
        this.collection[this.currentLayerIndex] = layerReportHelper.createFailedLayer(
            this.layers[this.currentLayerIndex + 1],
            this.onLayerComplete,
            this.onLayerFailed
        );
        this.processCurrentLayer();
    }

    LayerCollection.prototype.onLayerComplete = function() {
        if (!this._isActive()) {
            return;
        }
        this.currentLayerIndex += 1;
        this.asynchronouslyProcessCurrentLayer();
    }

    LayerCollection.prototype.serialize = function() {
        var layers = [];
        for (var i = 0; i < this.collection.length; i += 1) {
            layers.push(this.collection[i].serialize());
        }
        return {
            layers: layers,
        }
    }

    var factory = function(layers, onComplete, onFail, isActive) {
        return new LayerCollection(layers, onComplete, onFail, isActive);
    };
    factory.runScheduledMethod = runScheduledMethod;

    return factory;
    
}());
