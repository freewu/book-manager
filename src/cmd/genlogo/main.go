// Command genlogo derives the app icons and sidebar logo from the single
// source image asserts/logo.png (256x256 RGBA):
//   - build/appicon.png   (window icon, 256x256)
//   - build/windows/icon.ico (multi-size, PNG-compressed)
//   - frontend/src/assets/logo.png (sidebar logo, 256x256)
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"image/color"
	"math"
	"os"
)

func resizeBilinear(src *image.RGBA, w, h int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	sw, sh := float64(src.Bounds().Dx()), float64(src.Bounds().Dy())
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			fx := (float64(x)+0.5)*sw/float64(w) - 0.5
			fy := (float64(y)+0.5)*sh/float64(h) - 0.5
			x0 := int(math.Floor(fx))
			y0 := int(math.Floor(fy))
			tx := fx - float64(x0)
			ty := fy - float64(y0)
			clamp := func(v, lo, hi int) int {
				if v < lo {
					return lo
				}
				if v > hi {
					return hi
				}
				return v
			}
			x0 = clamp(x0, 0, src.Bounds().Dx()-1)
			y0 = clamp(y0, 0, src.Bounds().Dy()-1)
			x1 := clamp(x0+1, 0, src.Bounds().Dx()-1)
			y1 := clamp(y0+1, 0, src.Bounds().Dy()-1)
			c00 := src.RGBAAt(x0, y0)
			c01 := src.RGBAAt(x0, y1)
			c10 := src.RGBAAt(x1, y0)
			c11 := src.RGBAAt(x1, y1)
			lerp2 := func(a, b uint8, t float64) uint8 { return uint8(float64(a) + (float64(b)-float64(a))*t) }
			top := colorRGBA{lerp2(c00.R, c10.R, tx), lerp2(c00.G, c10.G, tx), lerp2(c00.B, c10.B, tx), lerp2(c00.A, c10.A, tx)}
			bot := colorRGBA{lerp2(c01.R, c11.R, tx), lerp2(c01.G, c11.G, tx), lerp2(c01.B, c11.B, tx), lerp2(c01.A, c11.A, tx)}
			dst.SetRGBA(x, y, color.RGBA{lerp2(top.R, bot.R, ty), lerp2(top.G, bot.G, ty), lerp2(top.B, bot.B, ty), lerp2(top.A, bot.A, ty)})
		}
	}
	return dst
}

type colorRGBA struct{ R, G, B, A uint8 }

func writeICO(path string, master *image.RGBA) error {
	sizes := []int{16, 32, 48, 64, 128, 256}
	var pngs [][]byte
	for _, s := range sizes {
		var small *image.RGBA
		if s == master.Bounds().Dx() {
			small = master
		} else {
			small = resizeBilinear(master, s, s)
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, small); err != nil {
			return err
		}
		pngs = append(pngs, buf.Bytes())
	}
	var out bytes.Buffer
	binary.Write(&out, binary.LittleEndian, uint16(0)) // reserved
	binary.Write(&out, binary.LittleEndian, uint16(1)) // type: icon
	binary.Write(&out, binary.LittleEndian, uint16(len(sizes)))
	offset := 6 + 16*len(sizes)
	for i, s := range sizes {
		w := byte(s)
		if s >= 256 {
			w = 0
		}
		out.WriteByte(w)
		out.WriteByte(w)
		out.WriteByte(0) // palette
		out.WriteByte(0) // reserved
		binary.Write(&out, binary.LittleEndian, uint16(1)) // planes
		binary.Write(&out, binary.LittleEndian, uint16(32))
		binary.Write(&out, binary.LittleEndian, uint32(len(pngs[i])))
		binary.Write(&out, binary.LittleEndian, uint32(offset))
		offset += len(pngs[i])
	}
	for _, p := range pngs {
		out.Write(p)
	}
	return os.WriteFile(path, out.Bytes(), 0o644)
}

func loadPNG(path string) (*image.RGBA, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, err
	}
	rgba, ok := img.(*image.RGBA)
	if !ok {
		b := img.Bounds()
		dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				dst.Set(x, y, img.At(x, y))
			}
		}
		rgba = dst
	}
	return rgba, nil
}

func main() {
	master, err := loadPNG("asserts/logo.png")
	if err != nil {
		panic(err)
	}
	if err := os.MkdirAll("build/windows", 0o755); err != nil {
		panic(err)
	}
	// build/appicon.png (wails window icon source)
	f2, err := os.Create("build/appicon.png")
	if err != nil {
		panic(err)
	}
	if err := png.Encode(f2, master); err != nil {
		panic(err)
	}
	f2.Close()
	// windows icon
	if err := writeICO("build/windows/icon.ico", master); err != nil {
		panic(err)
	}
	// sidebar logo used by the frontend
	if err := os.MkdirAll("frontend/src/assets", 0o755); err != nil {
		panic(err)
	}
	f3, err := os.Create("frontend/src/assets/logo.png")
	if err != nil {
		panic(err)
	}
	if err := png.Encode(f3, master); err != nil {
		panic(err)
	}
	f3.Close()
	fmt.Println("generated build/appicon.png, build/windows/icon.ico, frontend/src/assets/logo.png from asserts/logo.png")
}
