const layerTypes = {
	precomp : 0,
    solid : 1,
    still : 2,
    nullLayer : 3,
    shape : 4,
    text : 5,
    audio : 6,
    pholderVideo : 7,
    imageSeq : 8,
    video : 9,
    pholderStill : 10,
    guide : 11,
    adjustment : 12,
    camera : 13,
    light : 14
}

function random(len) {
    var sequence = 'abcdefghijklmnoqrstuvwxyz1234567890', returnString = '', i;
    for (i = 0; i < len; i += 1) {
        returnString += sequence.charAt(Math.floor(Math.random() * sequence.length));
    }
    return returnString;
}

function addCompsToSegment(layers, comps, segmentComps) {
    var i, len = layers.length, j, jLen;
    for (i = 0; i < len; i += 1) {
        if (layers[i].ty === layerTypes.precomp) {
            j = 0;
            jLen = comps.length;
            while (j < jLen) {
                if (comps[j].id === layers[i].refId) {
                    segmentComps.push(comps.splice(j, 1)[0]);
                    addCompsToSegment(segmentComps[segmentComps.length - 1].layers, comps, segmentComps);
                    break;
                }
                j += 1;
            }
        }
    }
}

function moveCompsAssetsToCompsArray(data) {
	if(!data.assets) {
		return;
	}
	var assets = data.assets;
	var comps = [];
	var i = 0, len = assets.length;
	var splicedComp;
	while (i < len) {
		if (assets[i].layers) {
			splicedComp = assets.splice(i, 1);
			comps.push(splicedComp[0]);
			i -= 1;
			len -= 1;
		}
		i += 1;
	}
	data.comps = comps;
}

function createSegmentationPlan(data, time, maxSegments) {
    var frameRate = data && data.fr;
    var inPoint = data && data.ip;
    var outPoint = data && data.op;
    var segmentLength = time * frameRate;
    if (!Number.isFinite(frameRate) || frameRate <= 0 || !Number.isFinite(inPoint) || !Number.isFinite(outPoint) || outPoint <= inPoint || !Number.isFinite(time) || time <= 0 || !Number.isFinite(segmentLength) || segmentLength <= 0) {
        var invalidError = new Error('The animation timing values are invalid.');
        invalidError.code = 'INVALID_ANIMATION_TIMING';
        throw invalidError;
    }
    var iterationCount = Math.max(0, Math.ceil((outPoint - inPoint) / segmentLength) - 1);
    if (!Number.isSafeInteger(iterationCount) || iterationCount > maxSegments) {
        var limitError = new Error('The animation exceeds the segment limit.');
        limitError.code = 'TOO_MANY_SEGMENTS';
        throw limitError;
    }
    return {
        frameRate: frameRate,
        segmentLength: segmentLength,
        totalFrames: outPoint - inPoint,
        iterationCount: iterationCount,
    };
}

function splitAnimation(data, time, animationSegments, plan, maxSegments) {
	moveCompsAssetsToCompsArray(data);
    var comps = data.comps;
    var layers = data.layers;
    var frameRate = plan.frameRate;
    var totalFrames = plan.totalFrames;
    var i, len = layers.length, j, jLen;
    var currentSegment = plan.segmentLength;
    var segmentLength = plan.segmentLength;
    var iterationCount = 0;
    var currentPeriod, segments, segmentComps;
    for (i = 0; i < len; i += 1) {
        if (layers[i].ip < currentSegment) {
            if (layers[i].ty === layerTypes.precomp) {
                if (!segmentComps) {
                    segmentComps = [];
                }
                j = 0;
                jLen = comps.length;
                while (j < jLen) {
                    if (comps[j].id === layers[i].refId) {
                        segmentComps.push(comps.splice(j, 1)[0]);
                        addCompsToSegment(segmentComps[segmentComps.length - 1].layers, comps, segmentComps);
                        break;
                    }
                    j += 1;
                }
            }
        }
    }

    if (data.assets && segmentComps && segmentComps.length) {
        data.assets = data.assets.concat(segmentComps);
        if (data.comps) {
            delete data.comps;
        }
    } else if(segmentComps) {
        data.assets = segmentComps;
    }
    
    var timeData;
    
    while (currentSegment < totalFrames) {
        iterationCount += 1;
        if (iterationCount > maxSegments || iterationCount > plan.iterationCount) {
            var limitError = new Error('The animation exceeds the segment limit.');
            limitError.code = 'TOO_MANY_SEGMENTS';
            throw limitError;
        }
        currentPeriod = null;
        segmentComps = null;
        for (i = 0; i < len; i += 1) {
            if (layers[i].ip >= currentSegment && layers[i].ip < currentSegment + segmentLength) {
                if (!segments) {
                    segments = [];
                }
                if (layers[i].ty === layerTypes.precomp) {
                    if (!segmentComps) {
                        segmentComps = [];
                    }
                    j = 0;
                    jLen = comps.length;
                    while (j < jLen) {
                        if (comps[j].id === layers[i].refId) {
                            segmentComps.push(comps.splice(j, 1)[0]);
                            addCompsToSegment(segmentComps[segmentComps.length - 1].layers, comps, segmentComps);
                            break;
                        }
                        j += 1;
                    }
                }
                if (!currentPeriod) {
                    timeData = currentSegment / frameRate;
                    currentPeriod = {
                        layers: []
                    };
                }
                var randomId = random(10);
                layers[i].id = randomId;
                currentPeriod.layers.push(layers[i]);
                layers[i] = {
                    id: randomId,
                    ty: 99
                };
            }
        }
        if (currentPeriod) {
            currentPeriod.assets = segmentComps;
            animationSegments.push(currentPeriod);
            segments.push({
                time: timeData
            });
        }
        currentSegment += segmentLength;
    }
    data.segments = segments;
}

function split(data, time, maxSegments) {
	var segmentLimit = Number.isSafeInteger(maxSegments) && maxSegments > 0 ? maxSegments : 1000;
	var plan = createSegmentationPlan(data, time, segmentLimit);
	var animationSegments = [];
	splitAnimation(data, time, animationSegments, plan, segmentLimit)
	
	//
	return {
		main: data,
		segments: [...animationSegments],
	};
}

split.createSegmentationPlan = createSegmentationPlan;
module.exports = split;
