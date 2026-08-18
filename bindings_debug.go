package main

import (
	"os"
	"time"
)

// DebugProbe is a TEMPORARY diagnostic binding. Remove after white-screen investigation.
func (a *App) DebugProbe(stage string) error {
	if a.dataDir == "" {
		return nil
	}
	f, err := os.OpenFile(a.dataDir+"/probe.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(time.Now().Format("15:04:05.000") + " " + stage + "\n")
	return err
}
