# agent.md

## 鐩殑

杩欎釜鏂囦欢缁?AI 鎴栫淮鎶よ€呮彁渚涗竴浠解€滄寜妯″潡鍙嶆煡瀹炵幇鈥濈殑绱㈠紩銆?
褰撳墠椤圭洰宸茬粡浠庢棭鏈熺殑鍗曟枃浠惰剼鏈紨杩涗负锛?
- 娴忚鍣ㄨ繍琛屽叆鍙ｏ細`index.html -> database-editor/script.js`
- 婧愮爜缁存姢鍏ュ彛锛歚database-editor/src/main.js`
- `database-editor/script.js` 鏄敱 `database-editor/src/main.js` 鍜?`database-editor/src/` 涓嬪悇妯″潡鎵撳寘鍑烘潵鐨勮繍琛?bundle锛屼笉鍐嶉€傚悎浣滀负鍞竴鐪熺浉鏉ユ簮
- 浠撳簱鍐呰繕鍖呭惈 `Runtime/` 杩愯鏃舵鏋朵笌 `Docs/` 鍒嗙被鏂囨。

濡傛灉瑕佹敼鍔熻兘锛屼紭鍏堣 `database-editor/src/`锛屽彧鍦ㄧ‘璁よ繍琛屾€佺粦瀹氭垨鍏煎闂鏃跺啀鍥炵湅鏍圭洰褰?`database-editor/script.js`銆?
## 鍏ュ彛涓庤閰?
- `index.html`
  椤甸潰缁撴瀯銆佹寜閽€侀潰鏉裤€佸脊灞傘€丩uckysheet 瀹瑰櫒銆?- `database-editor/src/main.js`
  搴旂敤瑁呴厤鍏ュ彛銆傝礋璐ｏ細
  - 缁存姢鍏ㄥ眬 `appState`
  - 鍒涘缓鍚勬ā鍧楀疄渚?  - 涓茶仈妯″潡渚濊禆
  - 缁戝畾 DOM 浜嬩欢
  - 灏嗗吋瀹瑰眰鏆撮湶鍒?`window.LegacyApp.modules`
- `database-editor/script.js`
  娴忚鍣ㄥ疄闄呭姞杞界殑 bundle锛岀敤浜庣洿鎺ユ墦寮€ `index.html` 鐨勮繍琛屽満鏅€?- `database-editor/build-runtime.ps1`
  浠?`database-editor/src/` 閲嶅缓鏍圭洰褰?`database-editor/script.js`銆?- `Runtime/`
  宸插苟鍏ヤ粨搴撶殑 EventBus / TickRunner 杩愯鏃舵鏋躲€?- `Docs/`
  缂栬緫鍣ㄣ€佽繍琛屾椂鍜屽弬鑰冭祫鏂欑殑鍒嗙被鏂囨。鐩綍銆?
## 浠撳簱绾х洰褰?
- `database-editor/src/`
  缂栬緫鍣ㄥ疄鐜般€?- `Runtime/`
  璺ㄥ紩鎿庤繍琛屾椂妗嗘灦锛?  - `Runtime/Shared`
  - `Runtime/Unity`
  - `Runtime/Godot`
- `Docs/`
  鍒嗙被鏂囨。锛?  - `Docs/editor`
  - `Docs/editor/legacy`
  - `Docs/editor/roadmap`
  - `Docs/runtime`
  - `Docs/reference`

## 褰撳墠妯″潡鍒嗗眰

### `database-editor/src/core`

- `app-mode.js`
  寮曟搸妯″紡涓庣紪杈戞ā寮忕殑鐘舵€佸垏鎹細
  - `unity / godot / ue`
  - `classic / sheet`
  - 琛ㄦ牸妯″紡閫変腑椤瑰綊涓€鍖?- `form-and-reference.js`
  琛ㄥ崟涓庡紩鐢ㄥ€煎熀纭€瑙勫垯锛?  - 鍚嶇О鍚堟硶鎬?  - `list.elementType`
  - `DataRef` / 绱㈠紩寮曠敤鍖呰涓庤В鍖?
### `database-editor/src/domain`

- `template-normalizer.js`
  妯℃澘缁撴瀯蹇収銆佺粨鏋勫彉鏇村垽鏂€佹棫鏁版嵁鍏煎褰掍竴鍖栥€乣indexField` 琛ラ綈銆?- `index-enum-validation.js`
  绱㈠紩瀛楁瑙ｆ瀽銆侀噸澶?ID / 閲嶅绱㈠紩妫€娴嬨€乣enum` 妯℃澘瑙勫垯銆佹灇涓惧畾涔夋彁鍙栥€佸弬鏁扮储寮曞悎娉曟€ф牎楠屻€?- `editor-actions.js`
  鍙傛暟鍊煎眰闈㈢殑绾€昏緫锛?  - 榛樿鍊肩敓鎴?  - 绫诲瀷杞崲
  - `list` 鍏冪礌鏍￠獙
  - 鍒楄〃绫诲瀷閿欒鏀堕泦

### `database-editor/src/services`

- `workspace-storage.js`
  宸ヤ綔鍖轰笌鏂囦欢绯荤粺璁块棶锛?  - 鐩綍閫夋嫨涓庢潈闄愭鏌?  - `dataEntity` / `csharpDate` / `godotCsharpDate` / `cppmodel` / `scripts` / `Editor` 鍙ユ焺瑙ｆ瀽
  - `dataEditorConfig/config.json`
  - IndexedDB 涓殑鏈€杩戠洰褰曞彞鏌勪笌 `enum` 缂撳瓨
  - 寮曟搸鍒囨崲鏃剁殑鐩綍鍑嗗涓庡啿绐佷骇鐗╂竻鐞?- `template-persistence.js`
  妯℃澘钀界洏涓庡洖璇讳富閾捐矾锛?  - `loadAllTemplates`
  - `saveAll`
  - `manifest.json`
  - `enum.json`
  - 鍨冨溇绠辨仮澶?  - 淇濆瓨鏃剁殑缁撴瀯鍙樺寲纭
  - 淇濆瓨鍚庤Е鍙戣繍琛屾椂浠ｇ爜鐢熸垚
- `csv-service.js`
  CSV 瀵煎叆瀵煎嚭锛?  - 瀵煎嚭閫夋嫨妯″紡
  - `buildCsvRowsForTemplate`
  - `buildTemplateFromCsv`
  - 绱㈠紩鍒楀崗璁笌 `DataRef` 搴忓垪鍖?
### `database-editor/src/generators`

- `csharp-runtime-generator.js`
  Unity / 閫氱敤 C# 杩愯鏃朵唬鐮佺敓鎴愶細
  - `modelCsharpe.cs`
  - `DataEntityRuntimeLoader.cs`
  - `DataEntityRuntimeTester.cs`
  - `DataEntityRuntimeTesterEditor.cs`
  - Unity / Godot 鐨勮繍琛屾椂璇存槑鏂囨。鍐呭
- `godot-runtime-generator.js`
  Godot C# 杈撳嚭鐩綍涓庤鏄庢枃浠剁敓鎴愬皝瑁呫€?- `ue-generator.js`
  UE `.h`銆佹灇涓惧ご銆乣DataRefTypes.h` 鐢熸垚涓庡懡鍚嶈鏁淬€?
### `database-editor/src/ui`

- `panels.js`
  涓夊垪妯″紡涓绘覆鏌擄細
  - 妯℃澘 / 瀹炰緥 / 鍙傛暟鍒楄〃鍒锋柊
  - 鍙傛暟璇︽儏缂栬緫鍖?  - 瀵规瘮鍊煎睍绀?  - 绱㈠紩璺宠浆
- `interaction.js`
  浜や簰澧炲己锛?  - 澶嶅埗 / 绮樿创 / 鍒犻櫎
  - 妗嗛€?/ Shift 鍖洪棿閫夋嫨
  - 绌虹櫧澶勫彇娑堥€夋嫨
  - 鍙傛暟鍘嗗彶鍥為€€
  - 鎼滅储杩囨护
- `sheet-mode.js`
  Luckysheet 琛ㄦ牸妯″紡锛?  - 宸ヤ綔绨挎瀯寤?  - 琛ㄦ牸鎻愪氦鍥炴ā鏉?  - 閲嶅 ID 楂樹寒
  - 琛ㄦ牸妯″紡鍒囨崲
- `system-panels.js`
  绯荤粺闈㈡澘涓庡弽棣堬細
  - 娑堟伅鎻愮ず
  - 鎿嶄綔鏃ュ織
  - 鍨冨溇绠遍潰鏉?
## 寤鸿闃呰椤哄簭

### 鎯崇湅鈥滃簲鐢ㄦ槸鎬庝箞鍚姩鐨勨€?
1. `database-editor/src/main.js`
2. `database-editor/src/services/workspace-storage.js`
3. `database-editor/src/services/template-persistence.js`

閲嶇偣鍏抽敭璇嶏細

- `createAppModeModule`
- `createWorkspaceStorageModule`
- `createTemplatePersistenceModule`
- `bootstrapApp`
- `chooseDirectory`
- `loadAllTemplates`

### 鎯崇湅鈥滀繚瀛樻椂鍒板簳浼氬啓浠€涔堚€?
1. `database-editor/src/services/template-persistence.js`
2. `database-editor/src/generators/csharp-runtime-generator.js`
3. `database-editor/src/generators/godot-runtime-generator.js`
4. `database-editor/src/generators/ue-generator.js`

閲嶇偣鍏抽敭璇嶏細

- `saveAll`
- `writeManifestForTemplates`
- `buildEnumTemplateJson`
- `generateRuntimeLoaderArtifacts`
- `generateUECppStructuresForCurrentTemplates`

### 鎯崇湅鈥滅储寮曞弬鏁?/ enum / list 涓轰粈涔堣繖鏍疯〃鐜扳€?
1. `database-editor/src/domain/index-enum-validation.js`
2. `database-editor/src/domain/editor-actions.js`
3. `database-editor/src/core/form-and-reference.js`
4. `database-editor/src/ui/panels.js`

閲嶇偣鍏抽敭璇嶏細

- `parameterIndexes`
- `isEnumTemplate`
- `getEnumDefinitions`
- `collectDuplicateIdInfo`
- `collectListTypeViolations`
- `wrapReferencePayload`

### 鎯崇湅鈥淐SV 鍜岃〃鏍兼ā寮忊€?
1. `database-editor/src/services/csv-service.js`
2. `database-editor/src/ui/sheet-mode.js`

閲嶇偣鍏抽敭璇嶏細

- `buildCsvRowsForTemplate`
- `buildTemplateFromCsv`
- `performExportCsv`
- `importFromCsv`
- `commitActiveSheetEdits`

## 涓庢棫缁撴瀯鐨勫叧绯?
- 鏍圭洰褰?`database-editor/script.js` 浠嶄繚鐣欏畬鏁撮€昏緫锛屼絾瀹冩槸鎵撳寘缁撴灉銆?- `database-editor/src/ui/panels.js`銆乣database-editor/src/ui/interaction.js`銆乣database-editor/src/ui/sheet-mode.js`銆乣database-editor/src/services/csv-service.js` 涓嶆槸绌哄３锛屽凡缁忔壙杞界湡瀹炲疄鐜般€?- 濡傛灉鍙戠幇 `database-editor/script.js` 涓?`database-editor/src/` 琛屼负涓嶄竴鑷达紝浼樺厛淇?`database-editor/src/`锛岀劧鍚庢墽琛岋細

```powershell
.\database-editor/build-runtime.ps1
```

## 蹇€熷畾浣嶅缓璁?
- 宸ヤ綔鍖?/ 鐩綍璁块棶锛?  `database-editor/src/services/workspace-storage.js`
- 妯℃澘璇诲啓 / 鍨冨溇绠?/ manifest锛?  `database-editor/src/services/template-persistence.js`
- CSV锛?  `database-editor/src/services/csv-service.js`
- 涓夊垪妯″紡 UI锛?  `database-editor/src/ui/panels.js`
- 琛ㄦ牸妯″紡锛?  `database-editor/src/ui/sheet-mode.js`
- 浜や簰涓庡揩鎹烽敭锛?  `database-editor/src/ui/interaction.js`
- Unity / Godot 杩愯鏃惰鍙?API锛?  `database-editor/src/generators/csharp-runtime-generator.js`
- UE 浠ｇ爜鐢熸垚锛?  `database-editor/src/generators/ue-generator.js`

## AI 淇敼寤鸿

- 闇€瑕佹敼涓氬姟瑙勫垯鏃讹紝鍏堢湅 `domain` / `core` 鏄惁宸叉湁绾嚱鏁板彲浠ュ鐢ㄣ€?- 闇€瑕佹敼鏂囦欢绯荤粺涓庤惤鐩樿涓烘椂锛屼紭鍏堟敼 `services`銆?- 闇€瑕佹敼鎸夐挳琛ㄧ幇銆侀€夋嫨鎬併€侀潰鏉垮埛鏂版椂锛屼紭鍏堟敼 `ui`銆?- 闇€瑕佹敼杩愯鏃惰鍙?API銆佺敓鎴愪骇鐗╃粨鏋勬垨璇存槑鏂囨。鏃讹紝浼樺厛鏀?`generators`銆?- 鏀瑰畬 `database-editor/src/` 鍚庯紝鍒繕浜嗛噸寤?`database-editor/script.js`锛屽惁鍒欐祻瑙堝櫒鐩存帴鎵撳紑 `index.html` 鏃朵笉浼氭嬁鍒版渶鏂伴€昏緫銆?
