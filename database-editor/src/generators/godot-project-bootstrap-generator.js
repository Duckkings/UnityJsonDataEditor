import { getGodotProjectAsset } from './godot-project-assets.js';

export const GODOT_RUNTIME_FOLDER_NAME = 'EventBusTickRunner';
export const GODOT_PREFAB_FOLDER_NAME = 'prefab';
export const GODOT_GAME_ROOT_SCENE_NAME = 'GameRoot.tscn';
export const GODOT_OBJECT_BASE_SCENE_NAME = 'ObjectBase.tscn';
export const SYSTEM_MODULE_DECLARE_TEMPLATE_NAME = 'systemModuleDeclare';
export const MODULE_DECLARE_TEMPLATE_NAME = 'moduleDeclare';
export const SYSTEM_EVENT_TEMPLATE_NAME = 'systemEvent';
export const SYSTEM_EVENT_TAG_TEMPLATE_NAME = 'systemEventTag';
export const EVENT_BUS_INIT_FILTER_TEMPLATE_NAME = 'eventBusInitFilter';

const DEFAULT_SYSTEM_MODULE_DECLARE_INSTANCE_NAME = 'UiSystemModule';
const DEFAULT_MODULE_DECLARE_INSTANCE_NAME = 'examplemodule';
const DEFAULT_SYSTEM_EVENT_INSTANCE_NAME = 'systemevent';
const DEFAULT_SYSTEM_EVENT_TAG_INSTANCE_NAME = 'exampletag';
const DEFAULT_WORLD_BUS_PROFILE_NAME = 'global_world_bus';

function buildBootstrapTemplateInstance({
  templateName,
  indexField = 'id',
  id = 0,
  name = 'default',
  payload = {},
} = {}) {
  const resolvedName = String(name || '').trim();
  const nextPayload = {
    template: templateName,
    id,
    name: resolvedName,
    ...payload,
  };
  const rawIndexValue =
    Object.prototype.hasOwnProperty.call(nextPayload, indexField) && nextPayload[indexField] != null
      ? nextPayload[indexField]
      : indexField === 'name'
        ? resolvedName
        : id;
  nextPayload.index = String(rawIndexValue ?? id);

  return {
    id,
    name: resolvedName,
    payload: nextPayload,
  };
}

export function buildGodotSharedRuntimeContent() {
  return getGodotProjectAsset('EventBusTickRunner/Shared/GameFrameworkRuntime.cs');
}

export function buildGodotRuntimeSupportContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/GodotRuntimeSupport.cs');
}

export function buildGodotEventBusNodeContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/GodotEventBusNode.cs');
}

export function buildGodotObjectModuleBaseContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/GodotObjectModuleBase.cs');
}

export function buildGodotObjectSnapshotSystemNodeContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/GodotObjectSnapshotSystemNode.cs');
}

export function buildGodotObjectRootNodeContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/GodotObjectRootNode.cs');
}

export function buildGodotRootTickRunnerNodeContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/GodotRootTickRunnerNode.cs');
}

export function buildGodotDataTableProviderContent() {
  return getGodotProjectAsset('EventBusTickRunner/Godot/DataTableProvider.cs');
}

export function buildGodotRuntimeFiles() {
  return [
    ...['GameFrameworkValueEvents.cs', 'TypedSnapshotRegion.cs', 'SnapshotValueExtensions.cs', 'FixedValueQueue.cs'].map((name) => ({
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Shared/${name}`,
      content: getGodotProjectAsset(`${GODOT_RUNTIME_FOLDER_NAME}/Shared/${name}`),
    })),
    ...['UiSystemTypes.cs', 'UiSystemModule.cs'].map((name) => ({
      relativePath: `ui/${name}`,
      content: getGodotProjectAsset(`ui/${name}`),
    })),
    {
      relativePath: 'godotCsharpDate/TickRunnerEventBusApiGuide.md',
      content: buildGodotTickRunnerEventBusApiGuideContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Shared/GameFrameworkRuntime.cs`,
      content: buildGodotSharedRuntimeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotRuntimeSupport.cs`,
      content: buildGodotRuntimeSupportContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotEventBusNode.cs`,
      content: buildGodotEventBusNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotObjectModuleBase.cs`,
      content: buildGodotObjectModuleBaseContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotObjectSnapshotSystemNode.cs`,
      content: buildGodotObjectSnapshotSystemNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotObjectRootNode.cs`,
      content: buildGodotObjectRootNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotRootTickRunnerNode.cs`,
      content: buildGodotRootTickRunnerNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/DataTableProvider.cs`,
      content: buildGodotDataTableProviderContent(),
    },
  ];
}
function buildGodotTickRunnerEventBusApiGuideContent() {
  return getGodotProjectAsset('godotCsharpDate/TickRunnerEventBusApiGuide.md');
}

export function buildGodotGameRootSceneContent(options = {}) {
  const scriptOutputRootName = options.scriptOutputRootName || 'scripts';
  const runtimeRootPath = `res://${scriptOutputRootName}/${GODOT_RUNTIME_FOLDER_NAME}/Godot`;
  return `[gd_scene load_steps=5 format=3]

[ext_resource type="Script" path="${runtimeRootPath}/GodotRootTickRunnerNode.cs" id="1_root"]
[ext_resource type="Script" path="${runtimeRootPath}/GodotEventBusNode.cs" id="2_bus"]
[ext_resource type="Script" path="${runtimeRootPath}/DataTableProvider.cs" id="3_provider"]
[ext_resource type="Script" path="res://${scriptOutputRootName}/ui/UiSystemModule.cs" id="4_ui"]

[node name="GameRoot" type="Node"]
script = ExtResource("1_root")
EventBusNodePath = NodePath("EventBus")
DataTableProviderPath = NodePath("DataTableProvider")

[node name="EventBus" type="Node" parent="."]
script = ExtResource("2_bus")
EventTableTemplateName = "${SYSTEM_EVENT_TEMPLATE_NAME}"
TagTableTemplateName = "${SYSTEM_EVENT_TAG_TEMPLATE_NAME}"
InitTagFilterTableTemplateName = "${EVENT_BUS_INIT_FILTER_TEMPLATE_NAME}"
InitTagFilterProfileName = "${DEFAULT_WORLD_BUS_PROFILE_NAME}"
EnableScopeCheckForLocal = false
ScopeRootPath = NodePath(".")

[node name="DataTableProvider" type="Node" parent="."]
script = ExtResource("3_provider")
DataDir = "res://dataEntity"

[node name="UiSystemModule" type="Node" parent="."]
script = ExtResource("4_ui")
`;
}

export function buildGodotObjectBaseSceneContent(options = {}) {
  const scriptOutputRootName = options.scriptOutputRootName || 'scripts';
  const runtimeRootPath = `res://${scriptOutputRootName}/${GODOT_RUNTIME_FOLDER_NAME}/Godot`;
  return `[gd_scene load_steps=4 format=3]

[ext_resource type="Script" path="${runtimeRootPath}/GodotObjectRootNode.cs" id="1_root"]
[ext_resource type="Script" path="${runtimeRootPath}/GodotEventBusNode.cs" id="2_bus"]
[ext_resource type="Script" path="${runtimeRootPath}/GodotObjectSnapshotSystemNode.cs" id="3_snapshot"]

[node name="ObjectBase" type="Node"]

[node name="ObjectSnapshotSystem" type="Node" parent="."]
script = ExtResource("3_snapshot")

[node name="ObjectRoot" type="Node" parent="."]
script = ExtResource("1_root")
ContextRootPath = NodePath("..")
LocalEventBusPath = NodePath("../LocalEventBus")
ObjectSnapshotSystemPath = NodePath("../ObjectSnapshotSystem")
ModuleDeclareTableTemplateName = "moduleDeclare"
DataTableProviderPath = NodePath("")
GlobalEventBusPath = NodePath("")

[node name="LocalEventBus" type="Node" parent="."]
script = ExtResource("2_bus")
Mode = 1
EventTableTemplateName = "${SYSTEM_EVENT_TEMPLATE_NAME}"
TagTableTemplateName = "${SYSTEM_EVENT_TAG_TEMPLATE_NAME}"
ScopeRootPath = NodePath("..")
`;
}
export function buildSystemModuleDeclareTemplate() {
  return {
    name: SYSTEM_MODULE_DECLARE_TEMPLATE_NAME,
    indexField: 'moduleKey',
    parameters: [
      {
        name: 'moduleKey',
        type: 'string',
      },
      {
        name: 'priority',
        type: 'int',
      },
      {
        name: 'ticktype',
        type: 'int',
      },
      {
        name: 'tags',
        type: 'string',
      },
      { name: 'uiPrefabPath', type: 'string' },
      { name: 'uiPriority', type: 'int' },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: SYSTEM_MODULE_DECLARE_TEMPLATE_NAME,
        indexField: 'moduleKey',
        id: 0,
        name: DEFAULT_SYSTEM_MODULE_DECLARE_INSTANCE_NAME,
        payload: {
          moduleKey: DEFAULT_SYSTEM_MODULE_DECLARE_INSTANCE_NAME,
          priority: 1100,
          ticktype: 0,
          tags: '',
          uiPrefabPath: '',
          uiPriority: 0,
        },
      }),
    ],
  };
}

export function buildSystemEventTemplate() {
  return {
    name: SYSTEM_EVENT_TEMPLATE_NAME,
    indexField: 'name',
    parameters: [
      {
        name: 'tags',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: SYSTEM_EVENT_TEMPLATE_NAME,
        indexField: 'name',
        id: 0,
        name: DEFAULT_SYSTEM_EVENT_INSTANCE_NAME,
        payload: {
          tags: '',
        },
      }),
    ],
  };
}

export function buildSystemEventTagTemplate() {
  return {
    name: SYSTEM_EVENT_TAG_TEMPLATE_NAME,
    indexField: 'name',
    parameters: [
      {
        name: 'description',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: SYSTEM_EVENT_TAG_TEMPLATE_NAME,
        indexField: 'name',
        id: 0,
        name: DEFAULT_SYSTEM_EVENT_TAG_INSTANCE_NAME,
        payload: {
          description: '',
        },
      }),
    ],
  };
}

export function buildEventBusInitFilterTemplate() {
  return {
    name: EVENT_BUS_INIT_FILTER_TEMPLATE_NAME,
    indexField: 'name',
    parameters: [
      {
        name: 'filters',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: EVENT_BUS_INIT_FILTER_TEMPLATE_NAME,
        indexField: 'name',
        id: 0,
        name: DEFAULT_WORLD_BUS_PROFILE_NAME,
        payload: {
          filters: '',
        },
      }),
    ],
  };
}

export function buildModuleDeclareTemplate() {
  return {
    name: MODULE_DECLARE_TEMPLATE_NAME,
    indexField: 'moduleKey',
    parameters: [
      {
        name: 'moduleKey',
        type: 'string',
      },
      {
        name: 'tags',
        type: 'string',
      },
      {
        name: 'priority',
        type: 'int',
      },
      { name: 'uiPrefabPath', type: 'string' },
      { name: 'uiPriority', type: 'int' },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: MODULE_DECLARE_TEMPLATE_NAME,
        indexField: 'moduleKey',
        id: 0,
        name: DEFAULT_MODULE_DECLARE_INSTANCE_NAME,
        payload: {
          moduleKey: DEFAULT_MODULE_DECLARE_INSTANCE_NAME,
          tags: '',
          priority: 0,
          uiPrefabPath: '',
          uiPriority: 0,
        },
      }),
    ],
  };
}
