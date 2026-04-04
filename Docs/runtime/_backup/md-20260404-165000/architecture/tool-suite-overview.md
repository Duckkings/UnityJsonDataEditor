# 宸ュ叿閾炬€昏

杩欎袱涓粨搴撶幇鍦ㄦ寜鈥滀竴濂楀伐鍏烽摼鈥濇潵鐞嗚В鏇村悎閫傦細

- `UnityJsonDataEditor`
  璐熻矗缂栬緫鏁版嵁銆佸鍑?JSON銆佺敓鎴愯繍琛屾椂浠ｇ爜銆?- `EventBus / TickRunner`
  璐熻矗鍦?Unity / Godot 涓寜琛ㄩ┍鍔ㄥ垵濮嬪寲妯″潡銆佸彂甯冧簨浠跺拰鎵ц Tick銆?
铻嶅悎鍚庯紝杩欎釜浠撳簱閲岀殑鑱岃矗鍙互杩欐牱鐪嬶細

## 椤跺眰鐩綍

- `src/`
  娴忚鍣ㄧ紪杈戝櫒婧愮爜銆?- `Runtime/`
  EventBus / TickRunner 杩愯鏃舵鏋躲€?- `Docs/`
  缂栬緫鍣ㄦ枃妗ｃ€佽繍琛屾椂鏂囨。鍜屽弬鑰冭祫鏂欍€?- 鏍圭洰褰?`README.md`
  缂栬緫鍣ㄤ娇鐢ㄨ鏄庝笌杩愯鏃惰鍙?API 鍏ュ彛銆?
## 涓ら儴鍒嗗浣曞崗浣?
### 1. 缂栬緫鍣ㄩ樁娈?
鍦ㄦ祻瑙堝櫒閲岀紪杈戞ā鏉垮悗锛岀紪杈戝櫒浼氱敓鎴愶細

- `dataEntity/`
  杩愯鏃惰鍙栫殑 JSON 鏁版嵁
- `csharpDate/`
  Unity 妯″紡杩愯鏃朵唬鐮?- `godotCsharpDate/`
  Godot C# 妯″紡杩愯鏃朵唬鐮?- `cppmodel/`
  UE 澶存枃浠?
鍏朵腑鍜?EventBus / TickRunner 鍏崇郴鏈€瀵嗗垏鐨勬槸锛?
- `dataEntity/`
- `DataEntityRuntimeLoader.cs`

### 2. 杩愯鏃堕樁娈?
`Runtime/` 閲岀殑妗嗘灦鏈韩涓嶈礋璐ｅ仛閰嶈〃缂栬緫锛屽畠鍙緷璧栦竴涓娊璞℃暟鎹簱鎺ュ彛锛?
```csharp
EventBusTableSchema GetSchema(string templateName);
```

涔熷氨鏄锛?
- 缂栬緫鍣ㄨ礋璐ｄ骇鍑?`dataEntity` 鍜岃鍙栦唬鐮?- 杩愯鏃舵鏋惰礋璐ｆ秷璐?`IDataTableRuntime`
- 涓棿閫氳繃 `DataEntityRuntimeLoader` 鎴栬嚜瀹氫箟 Provider 鍋氭ˉ鎺?
### 3. 妗嗘灦璇诲彇鍝簺琛?
褰撳墠妗嗘灦榛樿浼氳涓夌被琛細

- `systemInitOrder`
  鎺у埗妯″潡鍒濆鍖栭『搴忓拰 Update/LateUpdate 鍒嗘淳
- 浜嬩欢琛?  鐢?`EventBus` 閰嶇疆鍐冲畾
- 鏍囩琛?  鐢?`EventBus` 閰嶇疆鍐冲畾

## 鎺ㄨ崘宸ヤ綔娴?
### Unity

1. 鐢ㄧ紪杈戝櫒鐢熸垚 `dataEntity/`銆乣csharpDate/`銆乣Editor/`
2. 鎶婁粨搴撻噷鐨?`Runtime/Shared + Runtime/Unity` 鎷疯繘椤圭洰
3. 閰嶇疆 `RootTickRunner + EventBus`
4. 琛?`systemInitOrder`銆佷簨浠惰〃銆佹爣绛捐〃

### Godot

1. 鐢ㄧ紪杈戝櫒鐢熸垚 `dataEntity/`銆乣godotCsharpDate/`
2. 鎶婁粨搴撻噷鐨?`Runtime/Shared + Runtime/Godot` 鎷疯繘椤圭洰
3. 閰嶇疆 `GodotRootTickRunnerNode + GodotEventBusNode + DataTableProvider`
4. 璁?Provider 鎶?`DataEntityRuntimeLoader` 妗ユ帴鎴?`IDataTableRuntime`
5. 琛?`systemInitOrder`銆佷簨浠惰〃銆佹爣绛捐〃
6. 如果要做局部上下文，再看 `godot-system-object-root.md`

## 浠€涔堟椂鍊欒鍝唤鏂囨。

- 鎯崇煡閬撶紪杈戝櫒鍜岃繍琛屾椂鐨勫叧绯伙細鐪嬫湰椤?- 鎯崇煡閬撹繍琛屾椂鐩綍璇ユ€庝箞鐞嗚В锛氱湅 `eventbus-tickrunner-runtime.md`
- 鎯宠惤鍦板埌 Unity锛氱湅 `../setup/unity.md`
- 鎯宠惤鍦板埌 Godot锛氱湅 `../setup/godot.md`
