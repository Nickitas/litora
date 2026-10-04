package cli

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"coastal-geometry/internal/domain/methods"
)

// ResultArtifact описывает файл, созданный вычислительным ядром.
type ResultArtifact struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"sizeBytes"`
	SHA256    string `json:"sha256"`
}

// ResultManifest — машинно-читаемый перечень результатов успешной команды.
type ResultManifest struct {
	SchemaVersion int               `json:"schemaVersion"`
	Command       string            `json:"command"`
	Method        *methods.Identity `json:"method,omitempty"`
	CreatedAt     time.Time         `json:"createdAt"`
	Artifacts     []ResultArtifact  `json:"artifacts"`
}

func methodForCommand(command string) *methods.Identity {
	var method methods.Identity
	switch command {
	case "lito dimension":
		method = methods.BoxCounting()
	case "lito map":
		method = methods.OverviewMap()
	case "lito erosion":
		method = methods.LongshoreCERC()
	default:
		return nil
	}
	return &method
}

// WriteResultManifest сохраняет перечень файлов рядом с манифестом без перехода по символическим ссылкам.
// Каталог манифеста должен совпадать с каталогом --output конкретного запуска.
func WriteResultManifest(path, command string) error {
	path, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	directory := filepath.Dir(path)
	manifest := ResultManifest{SchemaVersion: 2, Command: command, Method: methodForCommand(command), CreatedAt: time.Now().UTC(), Artifacts: []ResultArtifact{}}
	err = filepath.WalkDir(directory, func(current string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || current == path || entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		file, err := os.Open(current)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, copyErr := io.Copy(hash, file)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		relative, err := filepath.Rel(directory, current)
		if err != nil {
			return err
		}
		manifest.Artifacts = append(manifest.Artifacts, ResultArtifact{Path: filepath.ToSlash(relative), SizeBytes: info.Size(), SHA256: hex.EncodeToString(hash.Sum(nil))})
		return nil
	})
	if err != nil {
		return fmt.Errorf("подготовка манифеста: %w", err)
	}
	if len(manifest.Artifacts) == 0 {
		return fmt.Errorf("команда не создала артефактов")
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}
