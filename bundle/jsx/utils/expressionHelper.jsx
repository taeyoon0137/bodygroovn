/*jslint vars: true , plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global $, esprima, escodegen*/

$.__bodymovin.bm_expressionHelper = (function () {
    var settingsHelper = $.__bodymovin.bm_settingsHelper;
    var bm_eventDispatcher = $.__bodymovin.bm_eventDispatcher;
    var generalUtils = $.__bodymovin.bm_generalUtils;
    var ob = {};
    var expressionStr;
    var renderingExpressions = [];
    var onStart, onEnd;
    var currentRenderGeneration = 0;

    function expressionIsValue(expression) {
        if(expression === 'value') {
            return true;
        }
        return false;
    }

    function hasExpressions(prop) {
        return prop.expressionEnabled && !prop.expressionError;
    }

    function checkExpression(prop, returnOb) {
        if (hasExpressions(prop)) {
            if(expressionIsValue(prop.expression)) {
                return;
            }
            onStart();
            expressionStr = prop.expression;
            ////
            var objectData = {
                id: generalUtils.random(10),
                ob: returnOb,
                text: expressionStr,
                render_generation: currentRenderGeneration,
            }
            bm_eventDispatcher.sendEvent('bm:expression:process', objectData);
            renderingExpressions.push(objectData);
        }
    }

    function shouldBakeExpression(property) {
        if (hasExpressions(property)) {
            if (settingsHelper.shouldBakeExpressions()
            || property.expression.indexOf("lottie:bake") !== -1){
                return true;
            }
        }
        return false;
    }

    function saveExpression(expressionData, id, generation) {
        var i = 0, len = renderingExpressions.length, didFindExpression = false;
        for (i = 0; i < len; i += 1) {
            if (renderingExpressions[i].id === id
                && renderingExpressions[i].render_generation === generation) {
                didFindExpression = true;
                var keyframeOb = renderingExpressions[i].ob;
                if (expressionData.isStatic) {
                    keyframeOb.a = 0;
                    keyframeOb.k = expressionData.text;
                } else if (!expressionData.hasFailed) {
                    keyframeOb.x = expressionData.text;
                }
                renderingExpressions.splice(i, 1);
                break;
            }
        }
        if (didFindExpression && renderingExpressions.length === 0) {
            onEnd();
        } else if (!didFindExpression) {
            $.__bodymovin.bm_renderManager.expressionProcessingFailed(generation);
        }
    }

    function checkReady() {
        return renderingExpressions.length === 0;
    }

    function reset(generation) {
        currentRenderGeneration = generation;
        renderingExpressions = [];
    }

    function setCallbacks(_onStart, _onEnd) {
        onStart = _onStart;
        onEnd = _onEnd;
    }

    ob.checkExpression = checkExpression;
    ob.shouldBakeExpression = shouldBakeExpression;
    ob.hasExpressions = hasExpressions;
    ob.saveExpression = saveExpression;
    ob.reset = reset;
    ob.checkReady = checkReady;
    ob.setCallbacks = setCallbacks;

    return ob;
}());
