/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global $, Folder, File, app */

$.__bodymovin.bm_animationReport = (function () {
    
    var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
    var layerCollectionFactory = $.__bodymovin.bm_layerCollectionReport;
    var versionHelper = $.__bodymovin.bm_versionHelper;

    function Animation(animation, onComplete, onFail, isActive) {
        this.animation = animation;
        this.messages = [];
        this._onComplete = onComplete;
        this._onFail = onFail;
        this._isActive = isActive || function () { return true; };
        this.onLayersComplete = this.onLayersComplete.bm_bind(this);
        try {
            this.layerCollection = layerCollectionFactory(animation.layers, this.onLayersComplete, this._onFail, this._isActive);
            this.process();
        } catch(error) {
            this._onFail(error);
        }
    }

    Animation.prototype.process = function() {
        if (this._isActive()) {
            this.layerCollection.process();
        }
    }

    Animation.prototype.onLayersComplete = function() {
        if (this._isActive()) {
            this._onComplete(this);
        }
    }

    Animation.prototype.serialize = function() {
        try {
            var layerCollection = this.layerCollection.serialize();
            var serializedData = {
                layers: layerCollection.layers,
            };

            var messages = [];
            for (var i = 0; i < this.messages.length; i += 1) {
                messages.push(this.messages[i].serialize());
            }
            serializedData.messages = messages;
            serializedData.id = this.animation.id;
            serializedData.name = this.animation.name;
            serializedData.version = versionHelper.get();
            return serializedData;
        } catch(error) {
            return null;
        }
    }



    return function(animation, onComplete, onFail, isActive) {
        return new Animation(animation, onComplete, onFail, isActive);
    }
    
}());
