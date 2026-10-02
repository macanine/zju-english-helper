// Next.js 的 PostCSS 插件加载器只接受「可调用且带 postcss=true」的模块，
// 而 @unocss/postcss 的主入口是 ESM（默认导出才是插件工厂），这里做一层桥接。
module.exports = require('@unocss/postcss').default
