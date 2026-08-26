/**
 * Ambient declarations for Adobe CEP 12 CSInterface.js.
 * Keep this file in parity with the byte-exact vendored JavaScript file.
 */

declare const EvalScript_ErrMessage: "EvalScript error.";

declare class CSXSWindowType {
  static readonly _PANEL: "Panel";
  static readonly _MODELESS: "Modeless";
  static readonly _MODAL_DIALOG: "ModalDialog";
}

declare class Version {
  static readonly MAX_NUM: 999999999;
  constructor(major: number, minor: number, micro: number, special: string);
  major: number;
  minor: number;
  micro: number;
  special: string;
}

declare class VersionBound {
  constructor(version: Version, inclusive: boolean);
  version: Version;
  inclusive: boolean;
}

declare class VersionRange {
  constructor(lowerBound: VersionBound, upperBound: VersionBound | null);
  lowerBound: VersionBound;
  upperBound: VersionBound | null;
}

declare class Runtime {
  constructor(name: string, versionRange: VersionRange);
  name: string;
  versionRange: VersionRange;
}

declare class Extension {
  constructor(
    id: string,
    name: string,
    mainPath: string,
    basePath: string,
    windowType: string,
    width: number,
    height: number,
    minWidth: number,
    minHeight: number,
    maxWidth: number,
    maxHeight: number,
    defaultExtensionDataXml: string,
    specialExtensionDataXml: string,
    requiredRuntimeList: Runtime[],
    isAutoVisible: boolean,
    isPluginExtension: boolean,
  );
  id: string;
  name: string;
  mainPath: string;
  basePath: string;
  windowType: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  defaultExtensionDataXml: string;
  specialExtensionDataXml: string;
  requiredRuntimeList: Runtime[];
  isAutoVisible: boolean;
  isPluginExtension: boolean;
}

declare class CSEvent {
  constructor(type: string, scope: string, appId: string, extensionId: string);
  type: string;
  scope: string;
  appId: string;
  extensionId: string;
  data: string | object;
}

declare class SystemPath {
  static readonly USER_DATA: "userData";
  static readonly COMMON_FILES: "commonFiles";
  static readonly MY_DOCUMENTS: "myDocuments";
  static readonly APPLICATION: "application";
  static readonly EXTENSION: "extension";
  static readonly HOST_APPLICATION: "hostApplication";
}

declare class ColorType {
  static readonly RGB: "rgb";
  static readonly GRADIENT: "gradient";
  static readonly NONE: "none";
}

declare class RGBColor {
  constructor(red: number, green: number, blue: number, alpha: number);
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

declare class Direction {
  constructor(x: number, y: number);
  x: number;
  y: number;
}

declare class GradientStop {
  constructor(offset: number, rgbColor: RGBColor);
  offset: number;
  rgbColor: RGBColor;
}

declare class GradientColor {
  constructor(type: string, direction: Direction, numStops: number, arrGradientStop: GradientStop[]);
  type: string;
  direction: Direction;
  numStops: number;
  arrGradientStop: GradientStop[];
}

declare class UIColor {
  constructor(type: string | number, antialiasLevel: number, color: RGBColor | GradientColor);
  type: string | number;
  antialiasLevel: number;
  color: RGBColor | GradientColor;
}

declare class AppSkinInfo {
  constructor(
    baseFontFamily: string,
    baseFontSize: number,
    appBarBackgroundColor: UIColor,
    panelBackgroundColor: UIColor,
    appBarBackgroundColorSRGB: UIColor,
    panelBackgroundColorSRGB: UIColor,
    systemHighlightColor: UIColor,
  );
  baseFontFamily: string;
  baseFontSize: number;
  appBarBackgroundColor: UIColor;
  panelBackgroundColor: UIColor;
  appBarBackgroundColorSRGB: UIColor;
  panelBackgroundColorSRGB: UIColor;
  systemHighlightColor: UIColor;
}

declare class HostEnvironment {
  constructor(
    appName: string,
    appVersion: string,
    appLocale: string,
    appUILocale: string,
    appId: string,
    isAppOnline: boolean,
    appSkinInfo: AppSkinInfo,
  );
  appName: string;
  appVersion: string;
  appLocale: string;
  appUILocale: string;
  appId: string;
  isAppOnline: boolean;
  appSkinInfo: AppSkinInfo;
}

declare class HostCapabilities {
  constructor(
    EXTENDED_PANEL_MENU: boolean,
    EXTENDED_PANEL_ICONS: boolean,
    DELEGATE_APE_ENGINE: boolean,
    SUPPORT_HTML_EXTENSIONS: boolean,
    DISABLE_FLASH_EXTENSIONS: boolean,
  );
  EXTENDED_PANEL_MENU: boolean;
  EXTENDED_PANEL_ICONS: boolean;
  DELEGATE_APE_ENGINE: boolean;
  SUPPORT_HTML_EXTENSIONS: boolean;
  DISABLE_FLASH_EXTENSIONS: boolean;
}

declare class ApiVersion {
  constructor(major: number, minor: number, micro: number);
  major: number;
  minor: number;
  micro: number;
}

declare class MenuItemStatus {
  constructor(menuItemLabel: string, enabled: boolean, checked: boolean);
  menuItemLabel: string;
  enabled: boolean;
  checked: boolean;
}

declare class ContextMenuItemStatus {
  constructor(menuItemID: string, enabled: boolean, checked: boolean);
  menuItemID: string;
  enabled: boolean;
  checked: boolean;
}

type CEPEventListener = (event: CSEvent) => void;
type CEPCallback<T = unknown> = (result: T) => void;

declare class CSInterface {
  static readonly THEME_COLOR_CHANGED_EVENT: "com.adobe.csxs.events.ThemeColorChanged";
  hostEnvironment: HostEnvironment | null;
  getHostEnvironment(): HostEnvironment;
  loadBinAsync(urlName: string, callback?: CEPCallback): void;
  loadBinSync(pathName: string): unknown;
  closeExtension(): void;
  getSystemPath(pathType: string): string;
  evalScript(script: string, callback?: CEPCallback<string>): void;
  getApplicationID(): string;
  getHostCapabilities(): HostCapabilities;
  dispatchEvent(event: CSEvent): void;
  addEventListener(type: string, listener: CEPEventListener, obj?: object): void;
  removeEventListener(type: string, listener: CEPEventListener, obj?: object): void;
  requestOpenExtension(extensionId: string, params: string): void;
  getExtensions(extensionIds?: string[]): Extension[];
  getNetworkPreferences(): Record<string, unknown>;
  initResourceBundle(): Record<string, string>;
  dumpInstallationInfo(): string;
  getOSInformation(): string;
  openURLInDefaultBrowser(url: string): number;
  getExtensionID(): string;
  getScaleFactor(): number;
  getMonitorScaleFactor(): number;
  setScaleFactorChangedHandler(handler: CEPCallback<number>): void;
  getCurrentApiVersion(): ApiVersion;
  setPanelFlyoutMenu(menu: string): void;
  updatePanelMenuItem(menuItemLabel: string, enabled: boolean, checked: boolean): boolean;
  setContextMenu(menu: string, callback: CEPCallback<string>): void;
  setContextMenuByJSON(menu: string, callback: CEPCallback<string>): void;
  updateContextMenuItem(menuItemID: string, enabled: boolean, checked: boolean): void;
  isWindowVisible(): boolean;
  resizeContent(width: number, height: number): void;
  registerInvalidCertificateCallback(callback: CEPCallback): void;
  registerKeyEventsInterest(keyEventsInterest: string): void;
  setWindowTitle(title: string): void;
  getWindowTitle(): string;
}

interface Window {
  __adobe_cep__?: Record<string, (...args: unknown[]) => unknown>;
}
