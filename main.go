package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

//go:embed frontend/dist
var content embed.FS

func main() {
	// Setup logging to file
	logFile, err := os.OpenFile("gofast_editor.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}

	loadConfig()

	// Serve static files from embedded fs
	// Serve static files from embedded fs or disk
	var distFS fs.FS
	if _, err := os.Stat("frontend/dist"); err == nil {
		log.Println("Serving frontend from disk (frontend/dist)")
		distFS = os.DirFS("frontend/dist")
	} else {
		log.Println("Serving frontend from embedded FS")
		d, err := fs.Sub(content, "frontend/dist")
		if err != nil {
			log.Fatal(err)
		}
		distFS = d
	}
	http.Handle("/", http.FileServer(http.FS(distFS)))

	// API endpoints
	http.HandleFunc("/api/run", handleRun)
	http.HandleFunc("/api/cmd", handleCmd)
	http.HandleFunc("/api/env", handleEnv)
	http.HandleFunc("/api/symbols", handleSymbols)
	http.HandleFunc("/api/fs/list", handleListFiles)
	http.HandleFunc("/api/fs/read", handleReadFile)
	http.HandleFunc("/api/fs/save", handleSaveFile)
	http.HandleFunc("/api/fs/resolve", handleResolveFile)
	http.HandleFunc("/api/fs/setworkdir", handleSetWorkDir)
	http.HandleFunc("/api/fs/pickdir", handlePickDir)
	http.HandleFunc("/api/exit", handleExit)

	port := "8080"
	log.Printf("Starting Editor at http://localhost:%s\n", port)

	// Initial index
	if currentWorkDir == "" {
		currentWorkDir, _ = os.Getwd()
	}
	if currentWorkDir != "" {
		go updateIndex(currentWorkDir)
	}

	// Open browser automatically
	openBrowser("http://localhost:" + port)

	err = http.ListenAndServe(":" + port, nil)
	if err != nil {
		log.Fatal(err)
	}
}

func openBrowser(url string) {
	if runtime.GOOS == "windows" {
		// Common paths for Edge and Chrome
		edgePaths := []string{
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
			"msedge.exe", // Fallback to PATH
		}
		chromePaths := []string{
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
			"chrome.exe", // Fallback to PATH
		}

		// Try Edge App Mode
		for _, p := range edgePaths {
			if strings.Contains(p, `\`) {
				if _, err := os.Stat(p); err != nil {
					continue
				}
			}
			if err := exec.Command(p, "--app="+url).Start(); err == nil {
				return
			}
		}

		// Try Chrome App Mode
		for _, p := range chromePaths {
			if strings.Contains(p, `\`) {
				if _, err := os.Stat(p); err != nil {
					continue
				}
			}
			if err := exec.Command(p, "--app="+url).Start(); err == nil {
				return
			}
		}

		// Fallback to default browser using ShellExecute via cmd
		// Using "" as the first argument to start is crucial
		exec.Command("cmd", "/c", "start", "", url).Start()
		return
	}

	if runtime.GOOS == "linux" {
		if err := exec.Command("google-chrome", "--app="+url).Start(); err == nil {
			return
		}
		if err := exec.Command("chromium", "--app="+url).Start(); err == nil {
			return
		}
		exec.Command("xdg-open", url).Start()
		return
	}

	if runtime.GOOS == "darwin" {
		exec.Command("open", url).Start()
		return
	}
}
