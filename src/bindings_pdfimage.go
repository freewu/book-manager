package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfimage"
)

// PDF 转存图片工具的后端绑定（前端 src/frontend/src/tools/pdf-image/）。
//
// 流程：PickPdfFile（或书架右键带入）→ PdfExtractInspect 确认页数/密码 →
// ReadPdfData 把文件交给 pdf.js → 用户在弹窗里选页范围、格式、清晰度和输出目录，
// 前端逐页渲染编码，每页调用一次 SavePdfImage 落盘。
//
// 后端没有 PDF 光栅化能力（纯 Go，不引 CGO），所以位图由 pdf.js 生成，
// 这里只做校验 + 写文件（文件名规则在 internal/pdfimage）。

// maxPdfImageBytes 限制单页图片的大小：一页 300 DPI 的位图也就几 MB，
// 超过这个量级基本是前端算错了，直接拒绝而不是把内存吃光。
const maxPdfImageBytes = 64 << 20 // 64 MB

// SavePdfImage writes one rendered page to disk and reports the file name.
func (a *App) SavePdfImage(opts models.PdfImageOptions) (models.PdfImageResult, error) {
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(opts.Data))
	if err != nil {
		return models.PdfImageResult{}, errors.New("图片数据损坏，无法保存")
	}
	if len(data) == 0 {
		return models.PdfImageResult{}, errors.New("这一页没有渲染出图片")
	}
	if len(data) > maxPdfImageBytes {
		return models.PdfImageResult{}, fmt.Errorf("单页图片太大（%.1f MB）", float64(len(data))/(1<<20))
	}

	res, err := pdfimage.Save(pdfimage.Options{
		Dir:    opts.Dir,
		Prefix: opts.Prefix,
		Format: opts.Format,
		Page:   opts.Page,
		Total:  opts.Total,
		Data:   data,
	})
	if err != nil {
		switch {
		case errors.Is(err, pdfimage.ErrNoDir):
			return models.PdfImageResult{}, errors.New("请先选择输出目录")
		case errors.Is(err, pdfimage.ErrNoData):
			return models.PdfImageResult{}, errors.New("这一页没有渲染出图片")
		case errors.Is(err, pdfimage.ErrBadFormat):
			return models.PdfImageResult{}, errors.New("只支持 PNG 和 JPEG 格式")
		case errors.Is(err, pdfimage.ErrBadPage):
			return models.PdfImageResult{}, fmt.Errorf("页码不合法：%v", err)
		default:
			return models.PdfImageResult{}, err
		}
	}

	return models.PdfImageResult{
		Path:    res.Path,
		Name:    res.Name,
		Bytes:   res.Bytes,
		Page:    res.Page,
		Existed: res.Existed,
	}, nil
}
