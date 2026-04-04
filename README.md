# 鏁版嵁琛ㄧ紪杈戝櫒 README 2.0

杩欎釜浠撳簱鐜板湪鎸夆€滀竴濂楀伐鍏烽摼鈥濈淮鎶わ細

- 缂栬緫鍣細娴忚鍣ㄤ腑鐨勬暟鎹〃缂栬緫涓庝唬鐮佺敓鎴?- 杩愯鏃讹細`Runtime/` 閲岀殑 EventBus / TickRunner 妗嗘灦
- 鏂囨。锛歚Docs/` 閲岀殑缂栬緫鍣ㄣ€佽繍琛屾椂鍜屽弬鑰冭祫鏂?
## 绠€浠?
杩欐槸涓€涓繍琛屽湪娴忚鍣ㄤ腑鐨勬湰鍦版暟鎹〃缂栬緫鍣紝闈㈠悜 `dataEntity` 鐩綍涓嬬殑 JSON 妯℃澘鏁版嵁锛屽苟鍙寜褰撳墠寮曟搸妯″紡鐢熸垚瀵瑰簲鐨勬暟鎹粨鏋勪唬鐮併€?
褰撳墠鐗堟湰宸茬粡涓嶆槸鍗曚竴鐨?Unity 宸ュ叿锛岃€屾槸涓€涓敮鎸佷笁绉嶇敓鎴愬舰鎬佺殑缂栬緫鍣細

- `Unity` 妯″紡锛氱敓鎴?C# 鏁版嵁缁撴瀯銆佹灇涓俱€乁nity 杩愯鏃跺姞杞藉櫒鍜岃皟璇曡剼鏈€?- `Godot C#` 妯″紡锛氱敓鎴?C# 鏁版嵁缁撴瀯銆佹灇涓俱€丟odot 鍙敤鐨勮繍琛屾椂鍔犺浇鍣ㄥ拰璋冭瘯鑴氭湰銆?- `UE` 妯″紡锛氱敓鎴?Unreal Engine 浣跨敤鐨?C++ 澶存枃浠跺拰鏋氫妇澶存枃浠躲€?
缂栬緫鍣ㄦ彁渚涗袱绉嶇紪杈戣鍥撅細

- `涓夊垪妯″紡`锛氭ā鏉?/ 瀹炰緥 / 鍙傛暟鐨勭粨鏋勫寲缂栬緫銆?
- `琛ㄦ牸妯″紡`锛氬熀浜?Luckysheet 鐨勬壒閲忚〃鏍肩紪杈戙€?

瀹冪洿鎺ヤ娇鐢ㄦ祻瑙堝櫒 `File System Access API` 璇诲啓鏈湴鐩綍锛屼笉渚濊禆鍚庣鏈嶅姟銆?
濡傛灉浣犺鎶婄紪杈戝櫒鐢熸垚鐗╁拰杩愯鏃舵鏋朵竴璧蜂娇鐢紝寤鸿鍐嶈锛?
- `Docs/README.md`
- `Docs/runtime/architecture/tool-suite-overview.md`
- `Docs/runtime/setup/unity.md`
- `Docs/runtime/setup/godot.md`

## 浠撳簱缁撴瀯

- `database-editor/src/`
  缂栬緫鍣ㄦ簮鐮併€?- `Runtime/`
  EventBus / TickRunner 杩愯鏃舵鏋讹紝宸插苟鍏ュ綋鍓嶄粨搴撱€?- `Docs/`
  鍒嗙被鏁寸悊鍚庣殑鏂囨。鐩綍銆?- `database-editor/vendor/`
  绗笁鏂逛緷璧栦笌鍓嶇璧勬簮銆?
琛ュ厖鍏ュ彛锛?
- `Runtime/README.md`
  杩愯鏃剁洰褰曞鑸€?- `Docs/editor/legacy/`
  鍘嗗彶鏂囨。褰掓。銆?- `Docs/editor/roadmap/`
  缂栬緫鍣ㄥ悗缁鍒掋€?
## 褰撳墠宸ヤ綔鍖虹粨鏋?
閫夋嫨宸ヤ綔鐩綍鍚庯紝缂栬緫鍣ㄤ細鎸夊綋鍓嶆ā寮忕淮鎶や互涓嬬洰褰曪細

- `dataEntity/`
  鐢ㄤ簬淇濆瓨妯℃澘 JSON銆?
- `dataEntity/manifest.json`
  璁板綍闈?`enum` 妯℃澘鍒?JSON 鏂囦欢鐨勬槧灏勩€?
- `dataEntity/toilet/`
  鍨冨溇绠辩洰褰曪紝琚垹闄ゆā鏉跨殑 JSON 浼氬厛绉诲姩鍒拌繖閲屻€?
- `dataEntity/csvoutput/`
  CSV 瀵煎嚭鐩綍銆?
- `dataEditorConfig/config.json`
  缂栬緫鍣ㄩ厤缃紝鐩墠浼氳褰曞綋鍓嶅紩鎿庢ā寮忋€?

Unity 妯″紡涓嬭繕浼氱淮鎶わ細

- `csharpDate/`
  鏅€氭ā鏉跨殑 C# 鏁版嵁缁撴瀯鑴氭湰銆?- `csharpDate/enums/`
  浠?`enum` 妯℃澘鐢熸垚鐨?C# 鏋氫妇銆?
- `csharpDate/modelstruct/`
  `modelCsharpe.cs`銆乣DataEntityRuntimeLoader.cs` 鍜岃鏄庢枃浠躲€?
- `csharpDate/DataEntityRuntimeTester.cs`
  杩愯鏃惰皟璇曡剼鏈€?
- `Editor/DataEntityRuntimeTesterEditor.cs`
  Unity 鑷畾涔?Inspector 璋冭瘯闈㈡澘銆?
Godot C# 妯″紡涓嬭繕浼氱淮鎶わ細

- `godotCsharpDate/`
  鏅€氭ā鏉跨殑 C# 鏁版嵁缁撴瀯鑴氭湰銆?- `godotCsharpDate/enums/`
  鐢?`enum` 妯℃澘鐢熸垚鐨?C# 鏋氫妇銆?- `godotCsharpDate/modelstruct/`
  `modelCsharpe.cs`銆乣DataEntityRuntimeLoader.cs` 鍜岃鏄庢枃浠躲€?- `godotCsharpDate/DataEntityRuntimeTester.cs`
  Godot 璋冭瘯鑴氭湰銆?
UE 妯″紡涓嬭繕浼氱淮鎶わ細

- `cppmodel/`
  鏅€氭ā鏉跨敓鎴愮殑 `.h` 鏂囦欢鍜?`DataRefTypes.h`銆?
- `cppmodel/enum/`
  鏋氫妇澶存枃浠躲€?

## 蹇€熷紑濮?

1. 鐢ㄦ敮鎸?`File System Access API` 鐨勬祻瑙堝櫒鎵撳紑 `index.html`銆?   褰撳墠榛樿鍏ュ彛涓虹粡鍏歌剼鏈?bundle锛屾敮鎸佺洿鎺ュ弻鍑绘墦寮€ `index.html`锛涙帹鑽?Chrome 鎴?Edge銆?   濡傛灉娴忚鍣ㄧ瓥鐣ラ檺鍒剁洰褰曡闂紝鍐嶆敼鐢ㄦ湰鍦?HTTP 鏈嶅姟鎵撳紑銆?2. 鐐瑰嚮鈥滈€夋嫨宸ヤ綔鐩綍鈥濄€?
   缂栬緫鍣ㄤ細鑷姩妫€鏌ュ苟琛ラ綈鎵€闇€瀛愮洰褰曘€?
3. 鏍规嵁鐩爣寮曟搸鐐瑰嚮鈥滃垏鎹㈠紩鎿庢ā寮忊€濄€?   Unity 妯″紡鏄剧ず鈥滈噸鏂扮敓鎴?C# 鏁版嵁缁撴瀯鑴氭湰鈥濓紝Godot C# 妯″紡鏄剧ず鈥滈噸鏂扮敓鎴?Godot C# 鏁版嵁缁撴瀯鑴氭湰鈥濓紝UE 妯″紡鏄剧ず鈥滈噸鏂扮敓鎴?C++ 鏁版嵁缁撴瀯鑴氭湰鈥濄€?4. 鍦ㄤ笁鍒楁ā寮忔垨琛ㄦ牸妯″紡涓紪杈戞ā鏉挎暟鎹€?
5. 鐐瑰嚮鈥滀繚瀛樷€濄€?
   淇濆瓨浼氬啓鍏?JSON锛屽苟鏍规嵁褰撳墠妯″紡鏇存柊鐢熸垚浜х墿銆?

缂栬緫鍣ㄤ細灏濊瘯鑷姩鎭㈠涓婁竴娆℃墦寮€杩囩殑宸ヤ綔鐩綍锛屽苟鍦ㄥ伐浣滅洰褰曢噷淇濆瓨褰撳墠寮曟搸妯″紡銆?
## 鎸夊紩鎿庝娇鐢?
### Unity 椤圭洰

1. 鍒囨崲鍒?`Unity` 妯″紡銆?2. 缂栬緫妯℃澘鍚庣偣鍑烩€滀繚瀛樷€濇垨鈥滈噸鏂扮敓鎴?C# 鏁版嵁缁撴瀯鑴氭湰鈥濄€?3. 灏嗙敓鎴愮殑 `csharpDate/`銆乣Editor/` 鍜?`dataEntity/` 鏀捐繘 Unity 椤圭洰銆?4. 杩愯鏃堕粯璁や粠 `Application.dataPath/dataEntity` 璇诲彇鏁版嵁锛屼篃鍙互鎵嬪姩璋冪敤 `DataEntityRuntimeLoader.Initialize(customPath)`銆?5. 璋冭瘯鏃跺彲浣跨敤 `DataEntityRuntimeTester.cs` 閰嶅悎 `Editor/DataEntityRuntimeTesterEditor.cs`銆?
### Godot C# 椤圭洰

1. 鍒囨崲鍒?`Godot C#` 妯″紡銆?2. 缂栬緫妯℃澘鍚庣偣鍑烩€滀繚瀛樷€濇垨鈥滈噸鏂扮敓鎴?Godot C# 鏁版嵁缁撴瀯鑴氭湰鈥濄€?3. 灏嗙敓鎴愮殑 `godotCsharpDate/` 鍜?`dataEntity/` 鏀捐繘 Godot 椤圭洰銆?4. 纭繚 Godot C# 椤圭洰宸茬粡瀹夎 `Newtonsoft.Json` 渚濊禆銆?5. 杩愯鏃堕粯璁よ鍙?`res://dataEntity`锛屼篃鍙互璋冪敤 `DataEntityRuntimeLoader.Initialize(customPath)` 鎸囧悜鍒殑鐩綍銆?6. 璋冭瘯鏃跺彲鎶?`godotCsharpDate/DataEntityRuntimeTester.cs` 鎸傚埌浠绘剰 `Node`锛岄€氳繃瀵煎嚭瀛楁鎴栦唬鐮佽皟鐢ㄦ墽琛屾祴璇曘€?
### Unreal Engine 椤圭洰

1. 鍒囨崲鍒?`UE` 妯″紡銆?2. 缂栬緫妯℃澘鍚庣偣鍑烩€滀繚瀛樷€濇垨鈥滈噸鏂扮敓鎴?C++ 鏁版嵁缁撴瀯鑴氭湰鈥濄€?3. 灏嗙敓鎴愮殑 `cppmodel/` 鍜?`dataEntity/` 鏀捐繘 Unreal 宸ョ▼銆?4. 鏅€氭ā鏉夸細鐢熸垚 `.h`锛屾灇涓句細鐢熸垚鍒?`cppmodel/enum/`锛屽叕鍏卞紩鐢ㄧ被鍨嬩細鐢熸垚 `DataRefTypes.h`銆?5. UE 妯″紡涓嬫ā鏉垮悕鍜屾灇涓惧€煎敖閲忓彧浣跨敤瀛楁瘝銆佹暟瀛楀拰涓嬪垝绾匡紝宸ュ叿浼氬涓嶅悎瑙勫懡鍚嶅仛鏇挎崲骞惰褰曟棩蹇椼€?
## 杩愯鏃惰鍙?API

Unity 妯″紡鍜?Godot C# 妯″紡閮戒細鐢熸垚 `DataEntityRuntimeLoader.cs`锛岃繖鏄繍琛屾椂璇诲彇鏁版嵁琛ㄧ殑缁熶竴鍏ュ彛銆?
### 鐢熸垚浣嶇疆

- Unity:
  `csharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- Godot C#:
  `godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs`

### 鍒濆鍖?
棣栨璇诲彇鍓嶅繀椤诲厛鍒濆鍖栦竴娆★細

```csharp
DataEntityRuntimeLoader.Initialize();
```

涔熷彲浠ユ樉寮忎紶鍏?`dataEntity` 鐩綍锛?
```csharp
// Unity
DataEntityRuntimeLoader.Initialize(Path.Combine(Application.dataPath, "dataEntity"));

// Godot
DataEntityRuntimeLoader.Initialize(ProjectSettings.GlobalizePath("res://dataEntity"));
```

榛樿鐩綍锛?
- Unity: `Application.dataPath/dataEntity`
- Godot C#: `res://dataEntity`

### 璇诲彇鏁村紶琛?
```csharp
var schema = DataEntityRuntimeLoader.GetSchema("TemplateName");
```

杩斿洖鐨勬槸 `TableSchema`锛屽叾涓細

- `schema.parameters` 鏄弬鏁板畾涔夊垪琛?- `schema.instances` 鏄寜瀹炰緥 `index` 寤虹珛鐨勫瓧鍏?
杩欎篃鏄?`EventBus` / `TickRunner` 褰撳墠鎺ュ叆鏁版嵁搴撴椂鏈€鐩存帴浣跨敤鐨勫叆鍙ｃ€?
### 璇诲彇鏅€氬瓧娈?
鍙互鎸夆€滃疄渚嬪悕鈥濇垨鈥滅储寮曞€尖€濊鍙栧弬鏁帮細

```csharp
var damage = DataEntityRuntimeLoader.GetValue<int>(
    "Monster",
    null,
    "Slime_001",
    "damage"
);

var speed = DataEntityRuntimeLoader.GetValue<float>(
    "Monster",
    "Slime",
    null,
    "moveSpeed"
);
```

鍙傛暟鍚箟锛?
- `templateName`: 妯℃澘鍚?- `instanceName`: 瀹炰緥鍚嶏紝鍙负绌?- `indexKey`: 瀹炰緥绱㈠紩鍊硷紝鍙负绌?- `parameterName`: 瑕佽鍙栫殑瀛楁鍚?
`instanceName` 鍜?`indexKey` 鑷冲皯鎻愪緵涓€涓紱濡傛灉涓よ€呴兘鎻愪緵锛屽簳灞備粛浠ュ畾浣嶅埌瀹炰緥涓哄噯銆?
### 璇诲彇绱㈠紩鍙傛暟

濡傛灉瀛楁鏈韩鏄竴涓储寮曞紩鐢ㄥ弬鏁帮紝鐩存帴 `GetValue<T>(..., parameterName)` 浼氭姤閿欙紱闇€瑕佸啀鍛婅瘔杩愯鏃垛€滆鍘荤洰鏍囧疄渚嬮噷鎷垮摢涓瓧娈碘€濓細

```csharp
var hp = DataEntityRuntimeLoader.GetValue<int>(
    "Monster",
    "Slime",
    null,
    "dropReward",
    "hp"
);
```

鍏朵腑鏈€鍚庝竴涓弬鏁?`getParameter`锛岃〃绀轰粠琚紩鐢ㄥ疄渚嬮噷鍐嶅彇鍝釜瀛楁銆?
### 鐩存帴鑾峰彇寮曠敤瀵硅薄

濡傛灉浣犳兂鍏堟嬁鍒板紩鐢紝鍐嶈嚜宸卞喅瀹氭€庝箞澶勭悊锛屽彲浠ョ敤锛?
```csharp
var dataRef = DataEntityRuntimeLoader.GetIndexReference(
    "Monster",
    "Slime",
    null,
    "dropReward"
);

var refKey = DataEntityRuntimeLoader.GetIndexValue(
    "Monster",
    "Slime",
    null,
    "dropReward"
);
```

鍏朵腑锛?
- `GetIndexReference(...)` 杩斿洖 `DataRef`
- `GetIndexValue(...)` 杩斿洖寮曠敤涓殑 `value`

### 閲嶈浇鏁版嵁

杩愯鏃跺鏋滃閮?JSON 琚浛鎹紝鍙互閲嶆柊鍔犺浇锛?
```csharp
DataEntityRuntimeLoader.Reload();
```

娉ㄦ剰锛?
- `manifest.json` 鍜屾墍鏈夋ā鏉?JSON 閮藉繀椤讳綅浜?`dataEntity/` 涓?- `GetSchema("涓嶅瓨鍦ㄧ殑妯℃澘")` 浼氭姏寮傚父锛屼笉浼氳繑鍥炵┖琛?- 瀵圭储寮曞弬鏁拌皟鐢?`GetValue<T>(..., parameterName)` 鏃讹紝濡傛灉娌′紶 `getParameter`锛屼細鎶涘紓甯?- `GetSchema()` / `GetValue()` 鐨勫墠鎻愰兘鏄凡缁忔墽琛岃繃 `Initialize()`

## 鍩烘湰鎿嶄綔鏂规硶

### 宸ュ叿鏍?
- `閫夋嫨宸ヤ綔鐩綍`
  缁戝畾鏈湴鐩綍锛屽苟鑷姩鍔犺浇妯℃澘銆?
- `淇濆瓨`
  鍐欏叆 JSON銆乣manifest.json`銆佸瀮鍦剧鐘舵€佸拰褰撳墠寮曟搸浜х墿銆?
- `琛ㄦ牸妯″紡`
  鍦ㄤ笁鍒楁ā寮忓拰 Luckysheet 琛ㄦ牸妯″紡涔嬮棿鍒囨崲銆?
- `鍒囨崲寮曟搸妯″紡`
  鍦?Unity / Godot C# / UE 涓夌鐢熸垚褰㈡€佷箣闂村垏鎹€?- `閲嶆柊鐢熸垚 C# 鏁版嵁缁撴瀯鑴氭湰`
  Unity 鍜?Godot C# 妯″紡鍙锛汫odot 妯″紡涓嬫寜閽枃妗堜細鍒囨崲涓衡€滈噸鏂扮敓鎴?Godot C# 鏁版嵁缁撴瀯鑴氭湰鈥濄€?- `閲嶆柊鐢熸垚 C++ 鏁版嵁缁撴瀯鑴氭湰`
  浠?UE 妯″紡鍙銆?- `瀵煎嚭涓?CSV`
  杩涘叆瀵煎嚭閫夋嫨妯″紡锛屽彲鎸夋ā鏉挎垨瀹炰緥閫夋嫨瀵煎嚭鑼冨洿銆?
- `浠?CSV 瀵煎叆`
  鏀寔涓€娆″鍏ュ涓?CSV 鏂囦欢銆?
- `澶滈棿妯″紡`
  鍒囨崲娣辨祬鑹蹭富棰樸€?
- `鎿嶄綔鎸囧崡`
  寮瑰嚭蹇嵎鎿嶄綔璇存槑銆?
- `鏌ョ湅鏃ュ織`
  鎵撳紑鏃ュ織闈㈡澘锛屾煡鐪嬪鍏ャ€佸鍑恒€佷繚瀛樸€佺敓鎴愬拰鍛婅淇℃伅銆?
- `鍨冨溇绠盽
  鏌ョ湅銆佹仮澶嶆垨褰诲簳鍒犻櫎宸茬Щ鍏ュ瀮鍦剧鐨勬ā鏉裤€?
- `鍙傛暟鏍忔瘮渚?/ 琛岄珮姣斾緥`
  璋冩暣鍙傛暟鏍忓搴﹀拰鍒楄〃琛岄珮銆?

### 涓夊垪妯″紡

涓夊垪妯″紡鏄綋鍓嶇殑涓荤紪杈戣鍥撅細

- 宸﹀垪锛氭ā鏉垮垪琛ㄣ€?
- 涓垪锛氬綋鍓嶆ā鏉跨殑瀹炰緥鍒楄〃銆?
- 鍙冲垪锛氬綋鍓嶅疄渚嬬殑淇濈暀瀛楁鍜岃嚜瀹氫箟鍙傛暟銆?

甯哥敤娴佺▼锛?

1. 鍦ㄥ乏鍒楁柊寤烘垨閫夋嫨妯℃澘銆?
2. 鍦ㄤ腑鍒楁柊寤恒€佸鍒躲€佺矘璐淬€佸垹闄ゅ疄渚嬨€?
3. 鍦ㄥ彸鍒楁柊澧炲弬鏁般€佽缃被鍨嬨€佸～鍐欑储寮曠粦瀹氭垨鐩存帴缂栬緫鍊笺€?
4. 濡傞渶鎵归噺鏌ョ湅鏌愬嚑涓瓧娈碉紝鍙娇鐢ㄢ€滃姣斿€尖€濆姛鑳姐€?
5. 淇濆瓨鍒扮鐩樸€?

### 琛ㄦ牸妯″紡

琛ㄦ牸妯″紡鐢ㄤ簬鎸夋ā鏉挎壒閲忕紪杈戝疄渚嬫暟鎹細

- 宸︿晶鍒楀嚭鎵€鏈夋ā鏉裤€?
- 涓棿鍖哄煙浣跨敤 Luckysheet 灞曠ず褰撳墠妯℃澘鐨勫疄渚嬭〃銆?
- 鍒囧洖涓夊垪妯″紡鎴栨墽琛屼繚瀛樻椂锛屼細鍏堝皾璇曟彁浜よ〃鏍间腑鐨勬湭钀界洏淇敼銆?

褰撴ā鏉挎病鏈夊疄渚嬫椂锛岃〃鏍兼ā寮忎細鏄剧ず绌虹姸鎬佹彁绀恒€?

### 鎼滅储銆佸閫夊拰蹇嵎閿?

缂栬緫鍣ㄥ唴缃簡杈冨畬鏁寸殑閫夋嫨涓庢壒閲忔搷浣滆兘鍔涳細

- 鍗曞嚮锛氬崟閫夈€?
- 鍐嶆鍗曞嚮鍞竴閫変腑椤癸細鍙栨秷閫夋嫨銆?
- `Ctrl+鐐瑰嚮`锛氬鍑忛€変腑妯℃澘銆佸疄渚嬫垨鍙傛暟銆?
- `Shift+鐐瑰嚮`锛氬尯闂村閫夈€?
- `Shift+鎷栨嫿`锛氭嫋鎷借寖鍥村閫夈€?
- `Ctrl+C / Ctrl+V`锛氭寜褰撳墠鐒︾偣鏍忕洰澶嶅埗 / 绮樿创銆?
- `Delete`锛氬垹闄ゅ綋鍓嶉€夋嫨銆?
- `Ctrl+S`锛氫繚瀛樸€?
- `F1`锛氳繑鍥炰笂涓€涓€変腑鐨勫弬鏁般€?
- `Alt+鐐瑰嚮` 绱㈠紩鍙傛暟锛氳烦杞埌琚储寮曠殑妯℃澘 / 瀹炰緥锛屽苟灏介噺瀹氫綅鍒扮洰鏍囧瓧娈点€?

妯℃澘鍜屽疄渚嬪垪琛ㄦ敮鎸佹悳绱€傛悳绱㈢粨鏋滃彧鍓╀竴椤规椂浼氳嚜鍔ㄩ€変腑璇ラ」銆?

## 鍔熻兘浠嬬粛

### 1. 妯℃澘銆佸疄渚嬨€佸弬鏁扮紪杈?

- 妯℃澘銆佸疄渚嬨€佸弬鏁伴兘鏀寔鍒涘缓銆侀噸鍛藉悕銆佸垹闄ゅ拰澶氶€夈€?
- 瀹炰緥鏀寔鎷栨嫿鎺掑簭銆?
- 妯℃澘鍜屽弬鏁颁篃鏀寔閫氳繃蹇嵎閿鍒?/ 绮樿创銆?
- 鍙傛暟鏀寔 `string`銆乣int`銆乣float`銆乣long`銆乣bool`銆乣list`銆乣object`锛屼互鍙婄敱 `enum` 妯℃澘娲剧敓鍑烘潵鐨勬灇涓剧被鍨嬨€?
- `list` 鍙傛暟鏀寔鎸囧畾鍏冪礌绫诲瀷銆?

### 2. 淇濈暀瀛楁涓庣储寮曞瓧娈?

姣忎釜瀹炰緥閮藉寘鍚洓涓繚鐣欏瓧娈碉細

- `template`
- `id`
- `name`
- `index`

鍏朵腑 `index` 涓嶆槸鐙珛杈撳叆瀛楁锛岃€屾槸鏍规嵁褰撳墠妯℃澘鐨?`indexField` 鍔ㄦ€佽绠楀緱鍑恒€傛櫘閫氭ā鏉垮彲浠ユ妸 `indexField` 鍒囨崲涓猴細

- `id`
- `name`
- 浠讳竴鏅€氬弬鏁板悕

`enum` 妯℃澘鐨?`indexField` 鍥哄畾涓?`id`銆?

### 3. 绱㈠紩鍙傛暟

鍙傛暟鍙互缁戝畾鍒板彟涓€涓ā鏉跨殑鍙储寮曞瓧娈碉紝褰㈡垚绱㈠紩寮曠敤锛?

- 鍙虫爮澶撮儴鍙€夋嫨绱㈠紩鐩爣妯℃澘鍜岀洰鏍囧弬鏁般€?
- 缁戝畾鍚庯紝璇ュ弬鏁颁細淇濆瓨涓?`{ template, by, value }` 褰㈠紡鐨勬暟鎹紩鐢ㄣ€?
- 鍗曞€肩储寮曞拰鍒楄〃绱㈠紩閮芥敮鎸併€?
- 缂栬緫鍣ㄤ細涓虹储寮曞弬鏁版彁渚涘€欓€夊€煎缓璁€?
- 绱㈠紩鐩爣涓嶈兘鎸囧悜 `enum` 妯℃澘銆?

### 4. enum 妯℃澘鏈哄埗

鍚嶅瓧涓?`enum` 鐨勬ā鏉垮叿鏈夌壒娈婅涔夛細

- 璇ユā鏉垮垱寤哄悗涓嶅彲鏀瑰悕銆?
- 鍏朵粬妯℃澘绂佹閲嶅懡鍚嶄负 `enum`銆?
- `enum` 妯℃澘鐨勬瘡涓疄渚嬪彲鐪嬩綔涓€涓灇涓剧被鍨嬨€?
- 鏋氫妇鍊间粠瀹炰緥 `payload` 涓殑鏁板瓧閿?`0銆?銆?...` 椤哄簭鎻愬彇銆?
- `enum` 妯℃澘浼氬弬涓?Unity C# 鏋氫妇鐢熸垚锛屼篃浼氬弬涓?UE 鏋氫妇澶存枃浠剁敓鎴愩€?

濡傛灉褰撳墠宸ヤ綔鐩綍閲屾病鏈?`enum.json`锛岀紪杈戝櫒杩樹細灏濊瘯浠庢祻瑙堝櫒 IndexedDB 涓仮澶?`enum` 妯℃澘缂撳瓨銆?

### 5. 瀵规瘮鍊?

鈥滃姣斿€尖€濈敤浜庢妸褰撳墠閫変腑鐨勫弬鏁板揩鐓у浐瀹氫笅鏉ワ紝骞剁洿鎺ラ檮鍔犳樉绀哄湪瀹炰緥鍒楄〃涓婏紝閫傚悎鍋氭í鍚戞瘮瀵癸細

- 鏅€氭ā鏉匡細鏄剧ず鎵€閫夊弬鏁扮殑褰撳墠鍊笺€?
- `enum` 妯℃澘锛氭樉绀哄綋鍓嶅疄渚嬩腑鎵€閫夋暟瀛楅敭瀵瑰簲鐨勫€笺€?

### 6. CSV 瀵煎叆瀵煎嚭

瀵煎嚭锛?

- 瀵煎嚭鐩綍鍥哄畾涓?`dataEntity/csvoutput/`銆?
- 鏀寔鏁存ā鏉垮鍑猴紝涔熸敮鎸佸彧瀵煎嚭閫変腑鐨勫疄渚嬨€?
- CSV 鍓嶄袱琛屽垎鍒槸瀛楁鍚嶅拰瀛楁绫诲瀷銆?
- 绱㈠紩鍙傛暟浼氬甫鍑虹洰鏍囨ā鏉裤€佺洰鏍囧弬鏁板拰绱㈠紩瀛楁淇℃伅銆?

瀵煎叆锛?

- 鏀寔涓€娆″鍏ュ涓?CSV銆?
- CSV 鑷冲皯闇€瑕?`template / id / name / index` 鍥涘垪銆?
- `list` 鍒楄姹傛槸 JSON 鏁扮粍鏂囨湰锛宍object` 鍒楄姹傛槸 JSON 瀵硅薄鏂囨湰銆?
- 瀵煎叆鍚屽悕妯℃澘鏃朵細瑕嗙洊缂栬緫鍣ㄤ腑鐨勭幇鏈夋ā鏉垮唴瀹广€?

### 7. 鏃ュ織涓庡瀮鍦剧

鏃ュ織锛?

- 瀵煎叆銆佸鍑恒€佷繚瀛樸€佺敓鎴愩€佸憡璀﹀拰閿欒閮戒細杩涘叆鏃ュ織闈㈡澘銆?
- 鏃ュ織闈㈡澘鏀寔娓呯┖銆?

鍨冨溇绠憋細

- 鍒犻櫎妯℃澘鏃讹紝JSON 涓嶄細绔嬪埢鐗╃悊鍒犻櫎锛岃€屾槸鍏堢Щ鍔ㄥ埌 `dataEntity/toilet/`銆?
- 鍨冨溇绠辨敮鎸佹仮澶嶆ā鏉裤€?
- 涔熸敮鎸佸交搴曟竻绌恒€?

### 8. 淇濆瓨涓庢牎楠岀瓥鐣?

淇濆瓨涓嶆槸鈥滄棤鏉′欢鍘熸牱钀界洏鈥濓紝鑰屾槸鍖呭惈涓€灞傛牎楠屽拰杩囨护锛?

- 闈?`enum` 妯℃澘浼氬啓鍏?`dataEntity/<妯℃澘鍚?.json`銆?
- `enum` 妯℃澘浼氶澶栫敓鎴?`enum.json`锛屽苟缂撳瓨鍒版祻瑙堝櫒 IndexedDB銆?
- 淇濆瓨鍚庝細閲嶅啓 `manifest.json`銆?
- 濡傛灉瀹炰緥 `id` 閲嶅锛岄噸澶嶉」涓嶄細鍐欏叆 JSON锛屼細鍦ㄦ棩蹇楅噷缁欏嚭璀﹀憡銆?
- 濡傛灉 `list` 鍙傛暟閲屽瓨鍦ㄤ笉绗﹀悎鍏冪礌绫诲瀷鐨勫€硷紝璇ュ疄渚嬩篃浼氳璺宠繃淇濆瓨锛屽苟璁板綍鍒版棩蹇椼€?
- Unity / Godot C# 妯″紡涓嬶紝濡傛灉缁撴瀯鍙樺寲瀵艰嚧瀵瑰簲 `.cs` 鍐呭鍙樺寲锛屼繚瀛樻椂浼氭彁绀轰綘閫夋嫨锛?  鏇挎崲 C# 骞朵繚瀛?JSON锛屾垨鍙繚瀛?JSON銆?
### 9. 浠ｇ爜鐢熸垚

Unity 妯″紡锛?
- 鐢熸垚姣忎釜鏅€氭ā鏉垮搴旂殑 C# 鏁版嵁缁撴瀯绫汇€?- 浠?`enum` 妯℃澘鐢熸垚 C# 鏋氫妇鏂囦欢銆?- 鐢熸垚 `DataEntityRuntimeLoader.cs`銆?- 鐢熸垚 `DataEntityRuntimeTester.cs` 鍜?`DataEntityRuntimeTesterEditor.cs`銆?
Godot C# 妯″紡锛?
- 鐢熸垚姣忎釜鏅€氭ā鏉垮搴旂殑 C# 鏁版嵁缁撴瀯绫汇€?- 浠?`enum` 妯℃澘鐢熸垚 C# 鏋氫妇鏂囦欢銆?- 鐢熸垚 Godot 鍙敤鐨?`DataEntityRuntimeLoader.cs`銆?- 鐢熸垚 Godot 鍙敤鐨?`DataEntityRuntimeTester.cs`銆?- 涓嶇敓鎴?Unity 涓撳睘鐨?`Editor/` 璋冭瘯闈㈡澘鑴氭湰銆?
UE 妯″紡锛?
- 涓烘櫘閫氭ā鏉跨敓鎴?`.h` 澶存枃浠躲€?
- 涓烘灇涓剧敓鎴?`cppmodel/enum/*.h`銆?
- 鐢熸垚 `DataRefTypes.h`銆?
- 閬囧埌涓嶇鍚?UE 鍛藉悕瑙勫垯鐨勫悕绉版椂锛屼細鑷姩鏇挎崲骞跺湪鏃ュ織涓粰鍑烘彁绀恒€?

## 浣跨敤寤鸿

- Unity 椤圭洰浼樺厛浣跨敤 Unity 妯″紡锛孏odot C# 椤圭洰浼樺厛浣跨敤 Godot C# 妯″紡锛孶E 椤圭洰浼樺厛浣跨敤 UE 妯″紡銆?- Godot C# 椤圭洰鍦ㄦ帴鍏ュ墠鍏堢‘璁?`Newtonsoft.Json` 渚濊禆宸插畨瑁呫€?- 妯℃澘鍚嶅拰瀹炰緥鍚嶅敖閲忎笉瑕佷娇鐢ㄧ函鏁板瓧銆?
- UE 妯″紡涓嬶紝妯℃澘鍚嶅拰鏋氫妇鍊兼渶濂藉彧鐢ㄥ瓧姣嶃€佹暟瀛楀拰涓嬪垝绾裤€?
- 闇€瑕佸ぇ閲忓綍琛ㄦ椂浼樺厛鐢ㄨ〃鏍兼ā寮忥紝鍋氱粨鏋勮璁″拰寮曠敤閰嶇疆鏃朵紭鍏堢敤涓夊垪妯″紡銆?

## 娉ㄦ剰浜嬮」

- 褰撳墠缂栬緫鍣ㄩ粯璁や互鈥滃崟宸ヤ綔鍖恒€佸崟寮曟搸浜х墿鈥濅负鐩爣銆?  鍦ㄤ繚瀛樻垨閲嶆柊鐢熸垚鏃讹紝浼氭竻鐞嗗彟涓€绉嶅紩鎿庢ā寮忎笅鐨勭敓鎴愮洰褰曪細
  Unity 妯″紡浼氭竻鐞?`godotCsharpDate/` 鍜?`cppmodel/`锛孏odot C# 妯″紡浼氭竻鐞?`csharpDate/`銆乣Editor/` 鍜?`cppmodel/`锛孶E 妯″紡浼氭竻鐞?`csharpDate/`銆乣Editor/` 鍜?`godotCsharpDate/`銆?- 宸ヤ綔鐩綍鐩綍缁撴瀯涓嶇鍚堣姹傛椂浼氶樆姝㈠姞杞姐€?  渚嬪 Unity / Godot C# 妯″紡涓嬪悇鑷殑 C# 杈撳嚭鐩綍涓嚭鐜伴潪 `.cs` 鏂囦欢锛屾垨 UE 妯″紡涓?`cppmodel/` 涓嚭鐜伴潪 `.h` 鏂囦欢銆?- `index` 鍙傛暟璺宠浆銆侀噸澶嶆爣璁般€佹棩蹇楀拰鍨冨溇绠遍兘浠ュ綋鍓嶇紪杈戝櫒鍐呭瓨鐘舵€佷负鍑嗭紝鏈€缁堣惤鐩樼粨鏋滀粛浠モ€滀繚瀛樻椂鏍￠獙鍚庣殑 JSON鈥濅负鍑嗐€?
- 鏃х増 README 宸茬粡杩囨湡锛屾湰鏂囦欢浠ュ綋鍓?`index.html` 鍜?`database-editor/script.js` 鐨勫疄鐜颁负鍑嗐€?
## 2026-04-02 鎷嗗垎鏇存柊

- 婧愮爜鍏ュ彛淇濇寔涓?`database-editor/src/main.js`锛屾祻瑙堝櫒杩愯鍏ュ彛璋冩暣涓烘牴鐩綍 `database-editor/script.js` bundle锛屼互鍏煎鐩存帴鎵撳紑 `index.html` 鐨?`file:///` 鍦烘櫙銆?- `database-editor/src/ui/panels.js`銆乣database-editor/src/ui/interaction.js`銆乣database-editor/src/ui/sheet-mode.js`銆乣database-editor/src/services/csv-service.js` 宸叉壙杞界湡瀹炲疄鐜帮紝涓嶅啀鍙槸妗ユ帴澹炽€?- `window.LegacyApp.modules` 缁х画淇濈暀锛屼絾鍏?`panels`銆乣interaction`銆乣sheetMode`銆乣csvService` 宸叉寚鍚戠湡瀹炴ā鍧楀疄渚嬨€?- `database-editor/src/main.js` 褰撳墠鑱岃矗浠ユā鍧楄閰嶃€侀潤鎬佷簨浠剁粦瀹氬拰璺ㄦā鍧楃紪鎺掍负涓伙紝`database-editor/script.js` 鐢卞叾鎵撳寘鐢熸垚锛屼笉鍐嶆壙杞芥墜鍐欎笟鍔￠€昏緫銆?
## 杩愯鍏ュ彛涓庨噸寤?
- 娴忚鍣ㄥ疄闄呭姞杞斤細`index.html -> database-editor/script.js`
- 婧愮爜缁存姢鍏ュ彛锛歚database-editor/src/main.js`
- 閲嶅缓杩愯 bundle锛?
```powershell
.\database-editor/build-runtime.ps1
```

