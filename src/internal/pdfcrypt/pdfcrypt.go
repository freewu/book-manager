// Package pdfcrypt sets, changes or inspects the password of a PDF file.
//
// It is a thin, testable wrapper around pdfcpu's encryption API so that the UI
// only has to deal with four verbs: "is this file encrypted?", "protect it with
// these options", "which files can I pick" and "strip its password".
package pdfcrypt

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/log"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// ErrPasswordRequired is returned when the file is encrypted and the supplied
// current password (possibly empty) does not open it.
var ErrPasswordRequired = errors.New("pdf is encrypted: a valid current password is required")

// ErrNotPDF is returned for files that are not PDF documents.
var ErrNotPDF = errors.New("not a pdf file")

// Strength selects the encryption algorithm written to the output file.
type Strength string

const (
	// StrengthAES256 is PDF 2.0 AES-256 (rev 6); the default.
	StrengthAES256 Strength = "aes256"
	// StrengthAES128 is AES-128 (rev 4); readable by older viewers.
	StrengthAES128 Strength = "aes128"
	// StrengthRC4128 is legacy RC4-128 (rev 3); for very old readers.
	StrengthRC4128 Strength = "rc4128"
)

// Options describes the protection to apply to a file.
type Options struct {
	// UserPassword must be typed by the reader to open the file.
	UserPassword string
	// OwnerPassword may be used to change permissions later. It defaults to
	// UserPassword when empty.
	OwnerPassword string
	// CurrentPassword opens an already encrypted input file. Ignored for
	// plain files.
	CurrentPassword string
	// Strength defaults to StrengthAES256 when empty.
	Strength Strength
	// AllowPrint / AllowCopy map to the PDF permission flags.
	AllowPrint bool
	AllowCopy  bool
}

// Info describes a PDF file. It is the JSON shape the frontend consumes.
type Info struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	Pages     int    `json:"pages"`
	Title     string `json:"title"`
	Encrypted bool   `json:"encrypted"`
}

// silenceOnce disables pdfcpu's console loggers: the app is a GUI, so its
// "using AES-256" chatter has nowhere useful to go.
var silenceOnce sync.Once

func silencePDFCPU() {
	silenceOnce.Do(log.DisableLoggers)
}

// Inspect reports the basic facts of a PDF file. For an encrypted file the
// password must open it, otherwise ErrPasswordRequired is returned together
// with an Info whose Encrypted flag is set.
func Inspect(path, password string) (Info, error) {
	silencePDFCPU()

	info := Info{Path: path, Name: filepath.Base(path)}
	fi, err := os.Stat(path)
	if err != nil {
		return info, err
	}
	if fi.IsDir() {
		return info, fmt.Errorf("%s is a directory", path)
	}
	info.Size = fi.Size()
	if fi.Size() == 0 {
		return info, fmt.Errorf("%s is empty", info.Name)
	}

	f, err := os.Open(path)
	if err != nil {
		return info, err
	}
	defer f.Close()

	conf := model.NewDefaultConfiguration()
	conf.UserPW = password
	pdfInfo, err := api.PDFInfo(f, path, nil, false, conf)
	if err != nil {
		if isPasswordError(err) {
			info.Encrypted = true
			return info, ErrPasswordRequired
		}
		return info, translate(err)
	}
	info.Encrypted = pdfInfo.Encrypted
	info.Pages = pdfInfo.PageCount
	info.Title = pdfInfo.Title
	if info.Encrypted && password == "" && !emptyUserPassword(path) {
		// Some files report their info without validating the password; make
		// sure the caller knows the current password will be needed.
		return info, ErrPasswordRequired
	}
	return info, nil
}

// Protect writes a password protected copy over path. The original file is
// only replaced after the new file has been written completely, so a failure
// (bad password, broken PDF, ...) leaves the original untouched.
func Protect(path string, opts Options) (Info, error) {
	silencePDFCPU()

	before, err := Inspect(path, opts.CurrentPassword)
	if err != nil {
		return before, err
	}

	src := path
	if before.Encrypted {
		// Decrypt to a sibling temp file first and encrypt that into place:
		// decrypting in place would leave the book unprotected if the second
		// pass failed.
		tmp, err := tempPDFName(filepath.Dir(path))
		if err != nil {
			return before, err
		}
		defer os.Remove(tmp)
		conf := model.NewDefaultConfiguration()
		conf.UserPW = opts.CurrentPassword
		if err := api.DecryptFile(path, tmp, conf); err != nil {
			return before, translate(err)
		}
		src = tmp
	}

	conf := encryptConfig(opts)
	if err := api.EncryptFile(src, path, conf); err != nil {
		return before, translate(err)
	}

	after, err := Inspect(path, opts.UserPassword)
	if err != nil {
		return after, err
	}
	after.Encrypted = true
	return after, nil
}

// Remove strips the password protection from path and returns the resulting
// (unencrypted) info. The current password must open the file; a plain file is
// returned unchanged. The file is rewritten in place only after pdfcpu has
// written the complete decrypted document to a sibling temp file, so a wrong
// password or a broken PDF leaves the original untouched.
func Remove(path, currentPassword string) (Info, error) {
	silencePDFCPU()

	before, err := Inspect(path, currentPassword)
	if err != nil {
		return before, err
	}
	if !before.Encrypted {
		return before, nil
	}

	conf := model.NewDefaultConfiguration()
	conf.UserPW = currentPassword
	conf.OwnerPW = currentPassword
	if err := api.DecryptFile(path, path, conf); err != nil {
		return before, translate(err)
	}

	after, err := Inspect(path, "")
	if err != nil {
		return after, err
	}
	after.Encrypted = false
	return after, nil
}

// encryptConfig builds the pdfcpu configuration for the requested options.
func encryptConfig(opts Options) *model.Configuration {
	conf := model.NewDefaultConfiguration()

	userPW := opts.UserPassword
	ownerPW := opts.OwnerPassword
	if ownerPW == "" {
		ownerPW = userPW
	}
	conf.UserPW = userPW
	conf.OwnerPW = ownerPW

	switch opts.Strength {
	case StrengthAES128:
		conf.EncryptUsingAES = true
		conf.EncryptKeyLength = 128
	case StrengthRC4128:
		conf.EncryptUsingAES = false
		conf.EncryptKeyLength = 128
	default:
		conf.EncryptUsingAES = true
		conf.EncryptKeyLength = 256
	}

	perms := model.PermissionsNone
	if opts.AllowPrint {
		perms += model.PermissionPrintRev2 + model.PermissionPrintRev3
	}
	if opts.AllowCopy {
		perms += model.PermissionExtract + model.PermissionExtractRev3
	}
	conf.Permissions = perms
	return conf
}

// tempPDFName reserves a unique name for a sibling temp file. The file itself
// is removed again because pdfcpu only creates its output when it does not
// exist yet.
func tempPDFName(dir string) (string, error) {
	f, err := os.CreateTemp(dir, ".bookmanager-pdf-*.pdf")
	if err != nil {
		return "", err
	}
	name := f.Name()
	f.Close()
	os.Remove(name)
	return name, nil
}

// emptyUserPassword reports whether an encrypted file opens with an empty user
// password (owner/password protected files do).
func emptyUserPassword(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	conf := model.NewDefaultConfiguration()
	if _, err := api.PDFInfo(f, path, nil, false, conf); err != nil {
		return false
	}
	return true
}

func isPasswordError(err error) bool {
	return errors.Is(err, pdfcpu.ErrWrongPassword) ||
		errors.Is(err, pdfcpu.ErrOwnerPasswordRequired)
}

// translate maps pdfcpu errors onto messages that make sense in the UI.
func translate(err error) error {
	if err == nil {
		return nil
	}
	if isPasswordError(err) {
		return ErrPasswordRequired
	}
	return fmt.Errorf("pdf: %w", err)
}
