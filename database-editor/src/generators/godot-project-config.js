export function buildGodotCSharpProjectContent() {
  return `<Project Sdk="Godot.NET.Sdk/4.6.1">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.4" />
  </ItemGroup>
</Project>
`;
}

// Insert only missing dependencies, retaining the SDK, framework, packages and comments.
export function ensureGodotCSharpDependencies(content) {
  const visible = content.replace(/<!--[\s\S]*?-->/g, (comment) => ' '.repeat(comment.length));
  const closing = visible.match(/<\/Project\s*>\s*$/);
  if (!/<Project\b[^>]*>/.test(visible) || !closing) {
    throw new Error('C# 项目文件格式不受支持，请检查 .csproj');
  }
  const additions = [];
  if (!/<EnableDynamicLoading\s*>\s*true\s*<\/EnableDynamicLoading>/i.test(visible)) {
    additions.push('  <PropertyGroup><EnableDynamicLoading>true</EnableDynamicLoading></PropertyGroup>');
  }
  if (!/<PackageReference\b[^>]*\bInclude\s*=\s*["']Newtonsoft\.Json["']/i.test(visible)) {
    additions.push('  <ItemGroup><PackageReference Include="Newtonsoft.Json" Version="13.0.4" /></ItemGroup>');
  }
  if (!additions.length) return content;
  return `${content.slice(0, closing.index)}${additions.join('\n')}\n${content.slice(closing.index)}`;
}
