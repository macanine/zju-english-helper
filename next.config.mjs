/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  // 每个路由导出成 <route>/index.html，任何静态服务器（含 GitHub Pages / python -m http.server）
  // 都能直接按目录解析，不依赖「无扩展名 → .html」的重写规则
  trailingSlash: true,
}

export default nextConfig
