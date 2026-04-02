
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(DataEntityRuntimeTester))]
public class DataEntityRuntimeTesterEditor : Editor
{
    private SerializedProperty operation;
    private SerializedProperty dataDirectory;
    private SerializedProperty templateName;
    private SerializedProperty instanceName;
    private SerializedProperty indexKey;
    private SerializedProperty parameterName;
    private SerializedProperty parameterType;
    private SerializedProperty getParameter;

    private void OnEnable()
    {
        operation = serializedObject.FindProperty("operation");
        dataDirectory = serializedObject.FindProperty("dataDirectory");
        templateName = serializedObject.FindProperty("templateName");
        instanceName = serializedObject.FindProperty("instanceName");
        indexKey = serializedObject.FindProperty("indexKey");
        parameterName = serializedObject.FindProperty("parameterName");
        parameterType = serializedObject.FindProperty("parameterType");
        getParameter = serializedObject.FindProperty("getParameter");
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        EditorGUILayout.PropertyField(operation);
        var op = (DataEntityRuntimeTester.TestOperation)operation.enumValueIndex;
        switch (op)
        {
            case DataEntityRuntimeTester.TestOperation.Initialize:
                EditorGUILayout.HelpBox("调用 DataEntityRuntimeLoader.Initialize", MessageType.Info);
                EditorGUILayout.PropertyField(dataDirectory, new GUIContent("数据目录(可空)"));
                break;
            case DataEntityRuntimeTester.TestOperation.Reload:
                EditorGUILayout.HelpBox("调用 DataEntityRuntimeLoader.Reload", MessageType.Info);
                break;
            case DataEntityRuntimeTester.TestOperation.GetValue:
                EditorGUILayout.HelpBox("读取数据并在控制台输出", MessageType.Info);
                EditorGUILayout.PropertyField(templateName, new GUIContent("模板名"));
                EditorGUILayout.PropertyField(instanceName, new GUIContent("实例名"));
                EditorGUILayout.PropertyField(indexKey, new GUIContent("索引字符"));
                EditorGUILayout.PropertyField(parameterName, new GUIContent("参数名"));
                EditorGUILayout.PropertyField(parameterType, new GUIContent("参数类型"));
                EditorGUILayout.PropertyField(getParameter, new GUIContent("索引获取参数(getParameter)"));
                break;
        }
        serializedObject.ApplyModifiedProperties();
        if (GUILayout.Button("执行"))
        {
            foreach (UnityEngine.Object target in targets)
            {
                if (target is DataEntityRuntimeTester tester)
                {
                    tester.ExecuteSelectedOperation();
                }
            }
        }
    }
}
#endif
