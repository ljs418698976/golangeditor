package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

// Request/Response structs
type RunRequest struct {
	Code    string            `json:"code"`
	Path    string            `json:"path"` // Path to the file being run (optional)
	Env     map[string]string `json:"env"`  // Custom GOROOT, GOPATH, GOPROXY
}

type RunResponse struct {
	Output string `json:"output"`
	Error  string `json:"error"`
}

type CmdRequest struct {
	Command string            `json:"command"`
	Env     map[string]string `json:"env"`
}

type EnvResponse struct {
	GoVersion string `json:"goVersion"`
	GoArch    string `json:"goArch"`
	GoOS      string `json:"goOs"`
	EnvVars   string `json:"envVars"`
}

type Config struct {
	LastWorkDir string `json:"lastWorkDir"`
}

var (
	currentWorkDir string
	configFile     = "editor_config.json"
)

func saveConfig() {
	cfg := Config{LastWorkDir: currentWorkDir}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	os.WriteFile(configFile, data, 0644)
}

func loadConfig() {
	data, err := os.ReadFile(configFile)
	if err == nil {
		var cfg Config
		if err := json.Unmarshal(data, &cfg); err == nil {
			if info, err := os.Stat(cfg.LastWorkDir); err == nil && info.IsDir() {
				currentWorkDir = cfg.LastWorkDir
			}
		}
	}
}

// Optimization: Global symbol cache
var (
	symbolCache []Symbol
	cacheMutex  = &strings.Builder{} // Using strictly as a dummy mutex, but usually sync.Mutex is better.
)

type Symbol struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"` // Function, Struct, Var, Const
	Path      string `json:"path"`
	Line      int    `json:"line"`
	Character int    `json:"character"`
}

func updateIndex(root string) {
	log.Println("Indexing symbols in:", root)
	var symbols []Symbol

	fset := token.NewFileSet()

	filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") || d.Name() == "node_modules" || d.Name() == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}

		// Parse file
		f, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return nil
		}

		// Collect functions
		for _, decl := range f.Decls {
			if fn, ok := decl.(*ast.FuncDecl); ok {
				pos := fset.Position(fn.Pos())
				kind := "Function"
				if fn.Recv != nil {
					kind = "Method"
				}
				symbols = append(symbols, Symbol{
					Name:      fn.Name.Name,
					Kind:      kind,
					Path:      path,
					Line:      pos.Line,
					Character: pos.Column,
				})
			}
			if gen, ok := decl.(*ast.GenDecl); ok {
				for _, spec := range gen.Specs {
					if typeSpec, ok := spec.(*ast.TypeSpec); ok {
						pos := fset.Position(typeSpec.Pos())
						symbols = append(symbols, Symbol{
							Name:      typeSpec.Name.Name,
							Kind:      "Struct",
							Path:      path,
							Line:      pos.Line,
							Character: pos.Column,
						})
					}
					if valSpec, ok := spec.(*ast.ValueSpec); ok {
						for _, name := range valSpec.Names {
							pos := fset.Position(name.Pos())
							kind := "Variable"
							if gen.Tok == token.CONST {
								kind = "Constant"
							}
							symbols = append(symbols, Symbol{
								Name:      name.Name,
								Kind:      kind,
								Path:      path,
								Line:      pos.Line,
								Character: pos.Column,
							})
						}
					}
				}
			}
		}
		return nil
	})

	symbolCache = symbols
	log.Printf("Indexed %d symbols\n", len(symbols))
}

func handleSymbols(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	json.NewEncoder(w).Encode(symbolCache)
}

type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Children []FileNode `json:"children,omitempty"`
}

func handleSetWorkDir(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Verify the path exists and is a directory
	info, err := os.Stat(req.Path)
	if err != nil {
		http.Error(w, "Path does not exist: "+err.Error(), http.StatusBadRequest)
		return
	}
	if !info.IsDir() {
		http.Error(w, "Path is not a directory", http.StatusBadRequest)
		return
	}

	currentWorkDir = req.Path
	saveConfig()
	go updateIndex(currentWorkDir) // Re-index
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "path": currentWorkDir})
}

func handlePickDir(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	// PowerShell command to open folder dialog
	psScript := `
	Add-Type -AssemblyName System.Windows.Forms
	$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
	$dialog.Description = "Select Project Directory"
	$res = $dialog.ShowDialog()
	if($res -eq "OK"){
		Write-Output $dialog.SelectedPath
	}
	`
	cmd := exec.Command("powershell", "-NoProfile", "-Command", psScript)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	output, err := cmd.CombinedOutput()

	path := strings.TrimSpace(string(output))
	if err != nil || path == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "cancelled"})
		return
	}

	// Set as work dir immediately
	currentWorkDir = path
	saveConfig()
	go updateIndex(currentWorkDir) // Re-index
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "path": path})
}

func handleListFiles(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	rootPath := r.URL.Query().Get("path")
	if rootPath == "" {
		if currentWorkDir != "" {
			rootPath = currentWorkDir
		} else {
			var err error
			rootPath, err = os.Getwd()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	files, err := os.ReadDir(rootPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var nodes []FileNode
	for _, f := range files {
		if strings.HasPrefix(f.Name(), ".") {
			continue // skip hidden files
		}

		fullPath := filepath.Join(rootPath, f.Name())
		node := FileNode{
			Name:  f.Name(),
			Path:  fullPath,
			IsDir: f.IsDir(),
		}
		nodes = append(nodes, node)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

func handleReadFile(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "Path required", http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"content": string(content)})
}

func handleResolveFile(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	basePath := r.URL.Query().Get("base")
	importPath := r.URL.Query().Get("import")

	if basePath == "" || importPath == "" {
		http.Error(w, "base and import required", http.StatusBadRequest)
		return
	}

	dir := filepath.Dir(basePath)
	resolved := ""

	// 1. Try relative to current file
	if strings.HasPrefix(importPath, ".") {
		resolved = checkExtensions(filepath.Join(dir, importPath))
	} else if strings.HasPrefix(importPath, "@/") {
		// Try relative to work dir
		if currentWorkDir != "" {
			// Try with alias removed (assuming @ matches root)
			resolved = checkExtensions(filepath.Join(currentWorkDir, importPath[2:]))
			if resolved == "" {
				// Try src folder (common in frontend projects)
				resolved = checkExtensions(filepath.Join(currentWorkDir, "src", importPath[2:]))
			}
		}
	} else {
		// Treat as potential relative path even if no ./
		resolved = checkExtensions(filepath.Join(dir, importPath))
		if resolved == "" && currentWorkDir != "" {
			// Try relative to work dir
			resolved = checkExtensions(filepath.Join(currentWorkDir, importPath))
		}
	}

	if resolved != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"path": resolved})
	} else {
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

func checkExtensions(p string) string {
	// Possible extensions to try
	extensions := []string{"", ".go", ".ts", ".tsx", ".js", ".jsx", ".json", "/index.go", "/index.ts", "/index.tsx", "/index.js"}
	for _, ext := range extensions {
		testPath := p + ext
		if info, err := os.Stat(testPath); err == nil && !info.IsDir() {
			return testPath
		}
	}
	return ""
}

func handleSaveFile(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := os.WriteFile(req.Path, []byte(req.Content), 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if strings.HasSuffix(req.Path, ".go") && currentWorkDir != "" {
		go updateIndex(currentWorkDir)
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func getGoBin(env map[string]string) string {
	if goroot, ok := env["GOROOT"]; ok && goroot != "" {
		return filepath.Join(goroot, "bin", "go")
	}
	return findGoExecutable()
}

func findGoExecutable() string {
	// 1. Check exact local paths first (portable preference)
	cwd, err := os.Getwd()
	if err != nil {
		return "go"
	}

	// Check cwd/go/bin/go
	if local, ok := checkGoPath(filepath.Join(cwd, "go", "bin", "go")); ok {
		return local
	}

	// Check cwd/*/go/bin/go (one level deep, for unzipped folders)
	entries, _ := os.ReadDir(cwd)
	for _, entry := range entries {
		if entry.IsDir() {
			// Check cwd/subdir/go/bin/go
			if local, ok := checkGoPath(filepath.Join(cwd, entry.Name(), "go", "bin", "go")); ok {
				return local
			}
			// Check cwd/subdir/bin/go (in case subdir IS the go root)
			if local, ok := checkGoPath(filepath.Join(cwd, entry.Name(), "bin", "go")); ok {
				return local
			}
		}
	}

	// 2. Fallback to PATH
	if path, err := exec.LookPath("go"); err == nil {
		return path
	}

	return "go"
}

func checkGoPath(path string) (string, bool) {
	if runtime.GOOS == "windows" {
		path += ".exe"
	}
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		return path, true
	}
	return "", false
}

func decodeOutput(output []byte) string {
	if runtime.GOOS != "windows" {
		return string(output)
	}

	// On Windows, command output is often in GBK encoding (especially for cmd /c)
	// We try to decode it. If it's already UTF-8, this might mangle it OR we can detect.
	// Simple approach: try to decode from GBK.
	reader := transform.NewReader(strings.NewReader(string(output)), simplifiedchinese.GBK.NewDecoder())
	decoded, err := io.ReadAll(reader)
	if err != nil {
		// Fallback to original if decoding fails
		return string(output)
	}
	return string(decoded)
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	var req RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var runFile string
	var cleanup func()

	// Determine go binary path
	goBin := getGoBin(req.Env)

	if req.Path != "" {
		// If path is provided, we run the actual file.
		// First, we ensure the file content is up to date with what's in the editor
		// This overwrites the file on disk, which is usually expected behavior for "Run"
		if err := os.WriteFile(req.Path, []byte(req.Code), 0644); err != nil {
			json.NewEncoder(w).Encode(RunResponse{Error: "Failed to save file before running: " + err.Error()})
			return
		}
		runFile = req.Path
		cleanup = func() {} // No cleanup needed for actual file
	} else {
		// Create a temporary file
		tmpFile, err := os.CreateTemp("", "main_*.go")
		if err != nil {
			json.NewEncoder(w).Encode(RunResponse{Error: "Failed to create temp file: " + err.Error()})
			return
		}
		runFile = tmpFile.Name()
		cleanup = func() { os.Remove(runFile) }

		if _, err := tmpFile.Write([]byte(req.Code)); err != nil {
			cleanup()
			json.NewEncoder(w).Encode(RunResponse{Error: "Failed to write code: " + err.Error()})
			return
		}
		tmpFile.Close()
	}
	defer cleanup()

	// Prepare command
	cmd := exec.Command(goBin, "run", runFile)

	// Set working directory to project root or file directory
	if req.Path != "" {
		// Update index if it's a Go file
		if strings.HasSuffix(req.Path, ".go") && currentWorkDir != "" {
			go updateIndex(currentWorkDir)
		}

		cmd.Dir = filepath.Dir(req.Path)
		// If we are in the root of a module, running 'go run main.go' works.
		// If currentWorkDir is set, we might want to run from there if it's the module root.
		// But usually setting Dir to the file's folder is safe for simple scripts,
		// and for modules, running from the root containing go.mod is better.
		// Let's try to detect if we are in a module.
		if currentWorkDir != "" && strings.HasPrefix(req.Path, currentWorkDir) {
			cmd.Dir = currentWorkDir
			// Check if we can use relative path logic later if needed

		}
	}

	// Apply environment variables
	cmd.Env = os.Environ()
	for k, v := range req.Env {
		if v != "" {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
		}
	}

	output, err := cmd.CombinedOutput()
	response := RunResponse{Output: decodeOutput(output)}
	if err != nil {
		response.Error = err.Error()
		if len(output) == 0 {
			response.Error += fmt.Sprintf("\n(Failed to execute '%s'. Check if Go is installed or GOROOT is configured correctly)", goBin)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleCmd(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	var req CmdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	args := strings.Fields(req.Command)
	if len(args) == 0 {
		return
	}

	name := args[0]
	cmdArgs := args[1:]

	// If the command is 'go', use the configured GOROOT
	if name == "go" {
		name = getGoBin(req.Env)
	}

	// Handle shell commands differently on Windows
	if runtime.GOOS == "windows" && name != "go" && !strings.Contains(name, string(os.PathSeparator)) {
		cmdArgs = []string{"/C", req.Command}
		name = "cmd"
	}

	cmd := exec.Command(name, cmdArgs...)

	// Apply Env
	cmd.Env = os.Environ()
	for k, v := range req.Env {
		if v != "" {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
		}
	}

	output, err := cmd.CombinedOutput()
	response := RunResponse{Output: decodeOutput(output)}
	if err != nil {
		response.Error = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleEnv(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	// Get GOROOT from query param
	goroot := r.URL.Query().Get("goroot")
	goBin := "go"
	if goroot != "" {
		goBin = filepath.Join(goroot, "bin", "go")
	} else {
		// Try to find auto-detected go
		goBin = findGoExecutable()
	}

	cmd := exec.Command(goBin, "env")
	output, err := cmd.CombinedOutput()

	resp := EnvResponse{
		GoVersion: runtime.Version(),
		GoArch:    runtime.GOARCH,
		GoOS:      runtime.GOOS,
		EnvVars:   decodeOutput(output),
	}

	if err != nil {
		resp.EnvVars = fmt.Sprintf("Error running '%s env': %v\nOutput: %s", goBin, err, decodeOutput(output))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleExit(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}
	log.Println("Shutting down...")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))

	// Exit after a short delay to allow response to be sent
	go func() {
		os.Exit(0)
	}()
}
