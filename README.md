# GoFast Editor - 便携式 Golang 编辑器

一个功能完整的 Golang 代码编辑器,支持代码高亮、文件管理、终端集成和一键运行。

## ✨ 功能特性

- 🎨 **Monaco 编辑器** - 与 VS Code 相同的编辑器核心
- 📁 **文件浏览器** - 浏览和打开本地 Go 文件
- ▶️ **一键运行** - 快速执行 Go 代码
- 💻 **集成终端** - 执行任意命令行指令
- 🔧 **环境配置** - 自定义 GOROOT、GOPATH、GOPROXY
- 📊 **控制台输出** - 实时查看程序运行结果
- 💾 **文件保存** - 编辑并保存 Go 源文件
- 🌙 **暗色主题** - 现代化的 UI 设计

## 🚀 快速开始

### 前置要求

1. **安装 Go** (如果系统中没有 Go)
   - 下载: https://golang.org/dl/
   - 或使用便携版 Go,在设置中配置 GOROOT

2. **安装 Node.js** (仅用于开发构建)
   - 下载: https://nodejs.org/

### 构建步骤

#### 1. 构建前端

```bash
cd frontend
npm install
npm run build
```

#### 2. 构建后端

```bash
# 使用完整的 Go 路径构建 (GUI 模式,无控制台窗口)
"D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" build -ldflags="-H windowsgui" -o GoFastEditor.exe .

# 或者如果 Go 已添加到 PATH
go build -ldflags="-H windowsgui" -o GoFastEditor.exe .
```

> **注意**: 
> - 使用 `-ldflags="-H windowsgui"` 参数可以隐藏控制台窗口
> - 服务器日志会写入到 `gofast_editor.log` 文件中

#### 3. 运行编辑器

**方式 1: 智能启动 (推荐)**
```bash
# 自动检测:如果有编译好的 exe 就运行 exe,否则使用 go run
.\run.bat
```

**方式 2: 使用 go run (开发模式)**
```bash
# 直接运行,无需编译
"D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" run main.go

# 或使用快速启动脚本
.\start.bat
```

**方式 3: 编译后运行 (生产模式)**
```bash
# Windows
.\GoFastEditor.exe

# Linux/Mac
./GoFastEditor
```

编辑器会自动在浏览器中打开 `http://localhost:8080`

> **注意**: 
> - 使用 `run.bat` 会自动选择最优方式启动
> - 使用 `go run` 方式启动时,编辑器内部执行代码也是使用 `go run`,完全兼容
> - **所有启动脚本都会自动关闭占用 8080 端口的旧进程**,避免端口冲突

### 端口管理

如果遇到端口占用错误 `bind: Only one usage of each socket address...`,可以使用以下方法:

**方法 1: 使用启动脚本 (推荐)**
```bash
# 启动脚本会自动关闭占用 8080 端口的进程
.\run.bat
# 或
.\start.bat
# 或
.\dev.bat
```

**方法 2: 手动关闭占用端口的进程**
```bash
# 关闭占用 8080 端口的进程
.\kill_port.bat

# 关闭占用其他端口的进程 (例如 3000)
.\kill_port.bat 3000
```

**方法 3: 手动查找并关闭进程**
```bash
# 1. 查找占用端口的进程
netstat -ano | findstr :8080

# 2. 记下 PID (最后一列的数字)

# 3. 关闭进程
taskkill /F /PID <进程ID>
```

## 📖 使用说明

### 基本操作

1. **打开文件**
   - 在左侧文件浏览器中点击文件即可打开
   - 支持浏览当前工作目录下的所有文件

2. **编辑代码**
   - 在中间的编辑器中编写或修改 Go 代码
   - 支持语法高亮、代码补全

3. **保存文件**
   - 点击顶部的 "Save" 按钮保存当前文件
   - 仅在打开文件后可用

4. **运行代码**
   - 点击 "Run Code" 按钮执行当前编辑器中的代码
   - 输出显示在右侧的 Console 面板

5. **使用终端**
   - 切换到 Terminal 标签页
   - 输入任意命令并按回车执行
   - 支持 `go build`, `go test` 等命令

### 环境配置

点击 "Settings" 按钮配置 Go 环境:

- **GOROOT**: Go 安装路径 (例: `C:\Go`)
- **GOPATH**: Go 工作空间路径 (例: `D:\GoProjects`)
- **GOPROXY**: Go 模块代理 (默认: `https://goproxy.cn,direct`)

### 查看环境信息

点击 "Env Info" 查看:
- Go 版本
- 操作系统和架构
- 完整的 `go env` 输出

## 🏗️ 项目结构

```
golangeditor/
├── main.go              # Go 后端服务器
├── go.mod               # Go 模块定义
├── build.bat            # 构建脚本
├── run.bat              # 智能启动脚本(优先 exe,否则 go run)
├── start.bat            # 快速启动脚本(go run)
├── dev.bat              # 开发模式脚本
├── frontend/            # React 前端
│   ├── src/
│   │   ├── App.tsx      # 主应用组件
│   │   ├── components/
│   │   │   ├── FileExplorer.tsx  # 文件浏览器
│   │   │   └── Terminal.tsx      # 终端组件
│   │   ├── index.css    # 全局样式
│   │   └── main.tsx     # 入口文件
│   ├── public/
│   │   └── monaco-editor/  # Monaco 编辑器资源
│   ├── dist/            # 构建输出 (嵌入到 Go 二进制)
│   └── package.json
└── README.md
```

## 🔌 API 端点

后端提供以下 API:

- `POST /api/run` - 运行 Go 代码
- `POST /api/cmd` - 执行命令行指令
- `GET /api/env` - 获取 Go 环境信息
- `GET /api/fs/list` - 列出目录内容
- `GET /api/fs/read` - 读取文件内容
- `POST /api/fs/save` - 保存文件内容

## 🎯 技术栈

### 前端
- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Monaco Editor** - 代码编辑器
- **Vite** - 构建工具
- **Axios** - HTTP 客户端
- **Lucide React** - 图标库

### 后端
- **Go 1.x** - 后端语言
- **embed** - 静态文件嵌入
- **net/http** - HTTP 服务器

## 📝 开发说明

### 开发模式

```bash
# 终端 1: 启动前端开发服务器
cd frontend
npm run dev

# 终端 2: 启动后端服务器
"D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" run main.go
# 或使用脚本
.\dev.bat
```

前端开发服务器: `http://localhost:5173`
后端 API 服务器: `http://localhost:8080`

### 生产构建

```bash
# 1. 构建前端
cd frontend
npm run build

# 2. 构建可执行文件 (GUI 模式)
cd ..
"D:\MStoreDownload\go1.25.6.windows-amd64\go\bin\go.exe" build -ldflags="-H windowsgui" -o GoFastEditor.exe .
# 或使用脚本
.\build.bat

# 3. 分发单个可执行文件
# GoFastEditor.exe 包含了所有前端资源
```

## 🛠️ 便携化部署

编译后的 `GoFastEditor.exe` 是完全独立的:
- ✅ 包含所有前端资源
- ✅ 无需额外依赖
- ✅ 可直接运行
- ⚠️ 需要系统中安装 Go (或在设置中配置 GOROOT)

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

## 📧 联系方式

如有问题或建议,请通过 GitHub Issues 联系。
