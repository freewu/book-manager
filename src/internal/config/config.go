// Package config persists app settings to a JSON file (book.config.json)
// in the data directory, replacing the old SQLite settings table.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Defaults for every known setting key.
var Defaults = map[string]string{
	"idle_seconds":     "60",
	"formats":          "epub,pdf,mobi,azw3,kepub",
	"douban_auto":      "0",
	"theme":            "light",
	"ui_theme":         "system",
	"language":         "zh-CN",
	"sidebar_collapsed": "0",
}

// Config is a thread-safe key/value settings store backed by a JSON file.
type Config struct {
	mu   sync.Mutex
	path string
	data map[string]string
}

// Load reads the config file from dataDir. If the file does not exist yet,
// values are seeded from legacy (the old SQLite settings table) and defaults.
// The merged result is written back to disk.
func Load(dataDir string, legacy map[string]string) *Config {
	c := &Config{
		path: filepath.Join(dataDir, "book.config.json"),
		data: map[string]string{},
	}

	// defaults first
	for k, v := range Defaults {
		c.data[k] = v
	}

	existed := false
	if raw, err := os.ReadFile(c.path); err == nil {
		existed = true
		var file map[string]string
		if json.Unmarshal(raw, &file) == nil {
			for k, v := range file {
				if v != "" {
					c.data[k] = v
				}
			}
		}
	}

	// one-time migration from the legacy SQLite settings table
	for k, v := range legacy {
		if v != "" && c.data[k] == Defaults[k] {
			c.data[k] = v
		}
	}

	if !existed {
		_ = c.saveLocked()
	}
	return c
}

// Get returns the value for key, falling back to the default when absent.
func (c *Config) Get(key string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.data[key]; ok && v != "" {
		return v
	}
	return Defaults[key]
}

// All returns a snapshot of all current values (defaults included).
func (c *Config) All() map[string]string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]string, len(c.data))
	for k, v := range c.data {
		out[k] = v
	}
	return out
}

// Set updates one key and writes the file through.
func (c *Config) Set(key, value string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data[key] = value
	return c.saveLocked()
}

// SetAll applies a batch of keys and writes the file through.
func (c *Config) SetAll(values map[string]string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range values {
		if v != "" {
			c.data[k] = v
		}
	}
	return c.saveLocked()
}

// Path returns the config file location (useful for display).
func (c *Config) Path() string { return c.path }

// saveLocked writes the config atomically (tmp file + rename). Caller holds mu.
func (c *Config) saveLocked() error {
	raw, err := json.MarshalIndent(c.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, c.path)
}
