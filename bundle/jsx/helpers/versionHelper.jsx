/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global Folder, File, $ */
$.__bodymovin.bm_versionHelper = (function () {
    var ob = {};
    var _version;
    var compatibilityVersion = '5.12.0';
    var productVersion = '5.12.0';

    function setVersion(data) {
        _version = data;
    }

    function getVersion() {
        return compatibilityVersion;
    }

    function getProductVersion() {
        return productVersion;
    }

    ob.set = setVersion;
    ob.get = getVersion;
    ob.getProductVersion = getProductVersion;

    return ob;
}());
