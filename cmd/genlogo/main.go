// Command genlogo generates logo.png (1024x1024), build/appicon.png and
// build/windows/icon.ico (multi-size, PNG-compressed) for the book-manager app.
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

const S = 4096 // supersample render size (4x of 1024 output)
const OUT = 1024

type P struct{ x, y float64 }

func inPoly(x, y float64, pts []P) bool {
	inside := false
	n := len(pts)
	j := n - 1
	for i := 0; i < n; i++ {
		xi, yi := pts[i].x, pts[i].y
		xj, yj := pts[j].x, pts[j].y
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			inside = !inside
		}
		j = i
	}
	return inside
}

func fillPoly(img *image.RGBA, pts []P, c color.RGBA) {
	for y := 0; y < S; y++ {
		for x := 0; x < S; x++ {
			if inPoly(float64(x)+0.5, float64(y)+0.5, pts) {
				img.SetRGBA(x, y, c)
			}
		}
	}
}

// roundedRect fills a rounded rect centered at (cx,cy) with half-extents
// (hw,hh) and corner radius r using a vertical gradient.
func roundedRect(img *image.RGBA, cx, cy, hw, hh, r float64, top, bottom color.RGBA) {
	ihw, ihh := hw-r, hh-r
	for y := 0; y < S; y++ {
		for x := 0; x < S; x++ {
			fx, fy := float64(x)+0.5, float64(y)+0.5
			qx := math.Max(math.Abs(fx-cx)-ihw, 0)
			qy := math.Max(math.Abs(fy-cy)-ihh, 0)
			if qx*qx+qy*qy <= r*r {
				t := math.Max(0, math.Min(1, (fy-(cy-hh))/(2*hh)))
				img.SetRGBA(x, y, lerpRGBA(top, bottom, t))
			}
		}
	}
}

func lerpRGBA(a, b color.RGBA, t float64) color.RGBA {
	return color.RGBA{
		uint8(float64(a.R) + (float64(b.R)-float64(a.R))*t),
		uint8(float64(a.G) + (float64(b.G)-float64(a.G))*t),
		uint8(float64(a.B) + (float64(b.B)-float64(a.B))*t),
		255,
	}
}

func scale4x(src *image.RGBA) *image.RGBA {
	// exact 4x box-average downsample
	dst := image.NewRGBA(image.Rect(0, 0, OUT, OUT))
	for y := 0; y < OUT; y++ {
		for x := 0; x < OUT; x++ {
			var r, g, b, a uint32
			for dy := 0; dy < 4; dy++ {
				for dx := 0; dx < 4; dx++ {
					c := src.RGBAAt(x*4+dx, y*4+dy)
					r += uint32(c.R)
					g += uint32(c.G)
					b += uint32(c.B)
					a += uint32(c.A)
				}
			}
			dst.SetRGBA(x, y, color.RGBA{uint8(r / 16), uint8(g / 16), uint8(b / 16), uint8(a / 16)})
		}
	}
	return dst
}

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
			top := color.RGBA{lerp2(c00.R, c10.R, tx), lerp2(c00.G, c10.G, tx), lerp2(c00.B, c10.B, tx), lerp2(c00.A, c10.A, tx)}
			bot := color.RGBA{lerp2(c01.R, c11.R, tx), lerp2(c01.G, c11.G, tx), lerp2(c01.B, c11.B, tx), lerp2(c01.A, c11.A, tx)}
			dst.SetRGBA(x, y, color.RGBA{lerp2(top.R, bot.R, ty), lerp2(top.G, bot.G, ty), lerp2(top.B, bot.B, ty), lerp2(top.A, bot.A, ty)})
		}
	}
	return dst
}

func buildMaster() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, S, S))
	k := S / 1024.0
	sc := func(x, y float64) P { return P{x * k, y * k} }

	// background rounded rect (indigo gradient)
	roundedRect(img, 512*k, 512*k, 460*k, 460*k, 190*k,
		color.RGBA{0x6E, 0x8B, 0xFF, 255}, color.RGBA{0x3E, 0x51, 0xE8, 255})

	// subtle inner glow: lighter rounded rect overlay (top half)
	roundedRect(img, 512*k, 420*k, 420*k, 420*k, 170*k,
		color.RGBA{255, 255, 255, 26}, color.RGBA{255, 255, 255, 0})

	// open book: left page
	fillPoly(img, []P{
		sc(285, 555), sc(505, 415), sc(505, 705), sc(285, 675),
	}, color.RGBA{0xFF, 0xFF, 0xFF, 255})
	// right page
	fillPoly(img, []P{
		sc(739, 555), sc(519, 415), sc(519, 705), sc(739, 675),
	}, color.RGBA{0xFF, 0xFF, 0xFF, 255})

	// page edge shading (subtle gray quads at outer edges)
	fillPoly(img, []P{
		sc(285, 555), sc(315, 538), sc(315, 685), sc(285, 675),
	}, color.RGBA{0xC9, 0xD2, 0xEA, 255})
	fillPoly(img, []P{
		sc(739, 555), sc(709, 538), sc(709, 685), sc(739, 675),
	}, color.RGBA{0xC9, 0xD2, 0xEA, 255})

	// spine
	fillPoly(img, []P{
		sc(503, 413), sc(521, 413), sc(521, 707), sc(503, 707),
	}, color.RGBA{0xB9, 0xC5, 0xE8, 255})

	// text lines on pages (light gray strokes)
	for _, ln := range [][4]float64{
		{333, 583, 470, 555}, {333, 606, 470, 578}, {333, 629, 470, 601},
		{473, 583, 610, 610}, {473, 606, 610, 633},
	} {
		x0, y0, x1, y1 := ln[0]*k, ln[1]*k, ln[2]*k, ln[3]*k
		steps := 60
		for i := 0; i < steps; i++ {
			t := float64(i) / float64(steps)
			px, py := x0+(x1-x0)*t, y0+(y1-y0)*t
			for dy := -1.0; dy <= 1; dy++ {
				for dx := -1.0; dx <= 1; dx++ {
					img.SetRGBA(int(px)+int(dx), int(py)+int(dy), color.RGBA{0xC9, 0xD2, 0xEA, 255})
				}
			}
		}
	}

	// bookmark ribbon (red, V notch at bottom)
	fillPoly(img, []P{
		sc(490, 388), sc(534, 388), sc(534, 480), sc(512, 450), sc(490, 480),
	}, color.RGBA{0xFF, 0x6B, 0x6B, 255})
	// bookmark darker edge
	fillPoly(img, []P{
		sc(490, 388), sc(502, 388), sc(502, 473), sc(490, 480),
	}, color.RGBA{0xE5, 0x55, 0x55, 255})

	return img
}

func writeICO(path string, master *image.RGBA) error {
	sizes := []int{16, 32, 48, 64, 128, 256}
	var pngs [][]byte
	for _, s := range sizes {
		var small *image.RGBA
		if s == OUT {
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

func main() {
	master := scale4x(buildMaster())
	if err := os.MkdirAll("build/windows", 0o755); err != nil {
		panic(err)
	}
	// logo.png at repo root
	f, err := os.Create("logo.png")
	if err != nil {
		panic(err)
	}
	if err := png.Encode(f, master); err != nil {
		panic(err)
	}
	f.Close()
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
	fmt.Println("generated logo.png, build/appicon.png, build/windows/icon.ico")
}
