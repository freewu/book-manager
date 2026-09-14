package main

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/db"
	"bookmanager/internal/models"
)

func tagApp(t *testing.T) *App {
	t.Helper()
	store, err := db.Open(filepath.Join(t.TempDir(), "book.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	return &App{store: store}
}

func TestTagsBindingCRUD(t *testing.T) {
	a := tagApp(t)

	id, err := a.CreateTag("科幻", "#ff0000")
	if err != nil || id == 0 {
		t.Fatalf("create: %v id=%d", err, id)
	}
	if _, err := a.CreateTag("科幻", "#111111"); err == nil {
		t.Fatal("重名标签应该报错")
	} else if err.Error() != db.ErrTagExists.Error() {
		t.Fatalf("重名错误信息：%q", err.Error())
	}
	if _, err := a.CreateTag("   ", "#111111"); err == nil {
		t.Fatal("空名标签应该报错")
	} else if err.Error() != db.ErrTagNameEmpty.Error() {
		t.Fatalf("空名错误信息：%q", err.Error())
	}

	tags, err := a.ListTags()
	if err != nil || len(tags) != 1 {
		t.Fatalf("list: %v %+v", err, tags)
	}
	if tags[0].Name != "科幻" || tags[0].Color != "#ff0000" || tags[0].Frozen || tags[0].BookCount != 0 {
		t.Fatalf("tag: %+v", tags[0])
	}

	if err := a.UpdateTag(id, " 硬科幻 ", "#00ff00"); err != nil {
		t.Fatalf("update: %v", err)
	}
	tags, _ = a.ListTags()
	if tags[0].Name != "硬科幻" || tags[0].Color != "#00ff00" {
		t.Fatalf("after update: %+v", tags[0])
	}
	if err := a.UpdateTag(id, "", "#00ff00"); err == nil {
		t.Fatal("空名重命名应该报错")
	}

	if err := a.FreezeTag(id, true); err != nil {
		t.Fatalf("freeze: %v", err)
	}
	tags, _ = a.ListTags()
	if !tags[0].Frozen {
		t.Fatalf("freeze 未生效：%+v", tags[0])
	}
	if err := a.FreezeTag(id, false); err != nil {
		t.Fatalf("unfreeze: %v", err)
	}
	tags, _ = a.ListTags()
	if tags[0].Frozen {
		t.Fatalf("unfreeze 未生效：%+v", tags[0])
	}

	res, err := a.store.DB().Exec("INSERT INTO books(path,file_name,format,title) VALUES('/tmp/x.epub','x.epub','epub','X')")
	if err != nil {
		t.Fatal(err)
	}
	bid, _ := res.LastInsertId()
	if err := a.SetBookTags(bid, []int64{id}); err != nil {
		t.Fatalf("set book tags: %v", err)
	}
	tags, _ = a.ListTags()
	if tags[0].BookCount != 1 {
		t.Fatalf("book_count = %d", tags[0].BookCount)
	}
	if err := a.DeleteTag(id); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if tags, _ = a.ListTags(); len(tags) != 0 {
		t.Fatalf("delete 后仍有标签：%+v", tags)
	}
	if b, err := a.GetBook(bid); err != nil || len(b.Tags) != 0 {
		t.Fatalf("删除标签后打标关系应清空：%v %+v", err, b)
	}
}

// 冻结的标签排在列表最后（前端直接按后端顺序分组展示）。
func TestTagsBindingListOrder(t *testing.T) {
	a := tagApp(t)
	first, _ := a.CreateTag("aaa", "#111111")
	if _, err := a.CreateTag("bbb", "#222222"); err != nil {
		t.Fatal(err)
	}
	if err := a.FreezeTag(first, true); err != nil {
		t.Fatal(err)
	}
	tags, err := a.ListTags()
	if err != nil || len(tags) != 2 {
		t.Fatalf("list: %v %+v", err, tags)
	}
	if tags[0].Name != "bbb" || tags[1].Name != "aaa" || !tags[1].Frozen {
		t.Fatalf("顺序：%+v", tags)
	}
}

func TestTagsBindingNilStore(t *testing.T) {
	a := &App{}
	if _, err := a.ListTags(); err == nil {
		t.Fatal("ListTags 需要报错")
	}
	if _, err := a.CreateTag("x", ""); err == nil {
		t.Fatal("CreateTag 需要报错")
	}
	if err := a.UpdateTag(1, "x", ""); err == nil {
		t.Fatal("UpdateTag 需要报错")
	}
	if err := a.FreezeTag(1, true); err == nil {
		t.Fatal("FreezeTag 需要报错")
	}
	if err := a.DeleteTag(1); err == nil {
		t.Fatal("DeleteTag 需要报错")
	}
	if err := a.SetBookTags(1, nil); err == nil {
		t.Fatal("SetBookTags 需要报错")
	}
}

// JSON 契约：字段名与 frontend/src/types.ts 的 Tag 一一对应。
func TestTagsJSONContract(t *testing.T) {
	raw := `{"id":3,"name":"科幻","color":"#5b7cfa","frozen":true,"book_count":7,"created_at":"2026-01-01 10:00:00"}`
	var tag models.Tag
	if err := json.Unmarshal([]byte(raw), &tag); err != nil {
		t.Fatal(err)
	}
	if tag.ID != 3 || tag.Name != "科幻" || tag.Color != "#5b7cfa" || !tag.Frozen || tag.BookCount != 7 || tag.CreatedAt == "" {
		t.Fatalf("unmarshal: %+v", tag)
	}

	out, err := json.Marshal(models.Tag{ID: 1, Name: "n", Color: "#fff", Frozen: true, BookCount: 2, CreatedAt: "t"})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"id", "name", "color", "frozen", "book_count", "created_at"} {
		if _, ok := m[k]; !ok {
			t.Fatalf("缺少字段 %s：%s", k, out)
		}
	}
	if m["frozen"] != true {
		t.Fatalf("frozen 值：%v", m["frozen"])
	}
}

// seedBindingBooks 造 n 本书，只关心 id（批量绑定测试用）。
func seedBindingBooks(t *testing.T, a *App, n int) []int64 {
	t.Helper()
	ids := make([]int64, 0, n)
	for i := 0; i < n; i++ {
		id, _, err := a.store.UpsertScannedBook(&models.Book{
			Path:     filepath.Join("E:", "Books", "batch"+string(rune('0'+i))+".epub"),
			FileName: "batch" + string(rune('0'+i)) + ".epub",
			Format:   "epub",
			Title:    "批量书" + string(rune('0'+i)),
			Size:     1024,
			Hash:     "hash" + string(rune('0'+i)),
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

func TestSetBooksTagsBinding(t *testing.T) {
	a := tagApp(t)
	books := seedBindingBooks(t, a, 3)

	tid, err := a.CreateTag("科幻", "#ff0000")
	if err != nil {
		t.Fatal(err)
	}
	if err := a.SetBooksTags(books, []int64{tid}, db.TagModeAdd); err != nil {
		t.Fatalf("add: %v", err)
	}
	for _, bid := range books {
		ids, _ := a.store.BookTagIDs(bid)
		if len(ids) != 1 || ids[0] != tid {
			t.Fatalf("book %d tags=%v", bid, ids)
		}
	}
	if err := a.SetBooksTags(books[1:], []int64{tid}, db.TagModeRemove); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if ids, _ := a.store.BookTagIDs(books[1]); len(ids) != 0 {
		t.Fatalf("remove 没生效: %v", ids)
	}
	if err := a.SetBooksTags(books, []int64{tid}, db.TagModeReplace); err != nil {
		t.Fatalf("replace: %v", err)
	}

	// 错误透传（前端按文案区分）
	if err := a.SetBooksTags(nil, []int64{tid}, db.TagModeAdd); err != db.ErrNoBooks {
		t.Fatalf("空列表: %v", err)
	}
	if err := a.SetBooksTags(books, nil, "nope"); err != db.ErrTagMode {
		t.Fatalf("未知方式: %v", err)
	}
	if err := a.SetBooksTags([]int64{999999}, nil, db.TagModeAdd); err != db.ErrBookGone {
		t.Fatalf("书不存在: %v", err)
	}
	if err := a.SetBooksTags(books, []int64{999999}, db.TagModeAdd); err != db.ErrTagGone {
		t.Fatalf("标签不存在: %v", err)
	}
}

func TestSetBooksTagsBindingNilStore(t *testing.T) {
	a := &App{}
	if err := a.SetBooksTags([]int64{1}, []int64{2}, db.TagModeAdd); err == nil {
		t.Fatal("store 为空应该报错")
	}
	if _, err := a.DeleteBooks([]int64{1}); err == nil {
		t.Fatal("store 为空应该报错")
	}
}

// TestBatchJSONContract 固定批量相关的 JSON 字段名（前端按这些名字取值）。
func TestBatchJSONContract(t *testing.T) {
	a := tagApp(t)
	books := seedBindingBooks(t, a, 2)
	tid, _ := a.CreateTag("科幻", "#ff0000")
	if err := a.SetBooksTags(books, []int64{tid}, db.TagModeAdd); err != nil {
		t.Fatal(err)
	}

	// DeleteBooks 返回纯数字（行数）
	raw, err := json.Marshal(mustJSON(t, func() (any, error) { return a.DeleteBooks(books[:1]) }))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "1" {
		t.Fatalf("DeleteBooks JSON: %s", raw)
	}

	// 批量设置标签的入参结构（前端传 {book_ids, tag_ids, mode} 展开成三个位置参数）
	in := struct {
		BookIDs []int64 `json:"book_ids"`
		TagIDs  []int64 `json:"tag_ids"`
		Mode    string  `json:"mode"`
	}{BookIDs: books[1:], TagIDs: []int64{tid}, Mode: db.TagModeRemove}
	rawIn, _ := json.Marshal(in)
	for _, key := range []string{`"book_ids"`, `"tag_ids"`, `"mode"`} {
		if !strings.Contains(string(rawIn), key) {
			t.Fatalf("入参缺少 %s: %s", key, rawIn)
		}
	}
	if err := a.SetBooksTags(in.BookIDs, in.TagIDs, in.Mode); err != nil {
		t.Fatal(err)
	}
	if ids, _ := a.store.BookTagIDs(books[1]); len(ids) != 0 {
		t.Fatalf("remove 没生效: %v", ids)
	}
}

// ReorderTags 绑定：按传入顺序落库，store 未初始化时报错。
func TestReorderTagsBinding(t *testing.T) {
	a := tagApp(t)
	first, _ := a.CreateTag("甲", "#111111")
	second, _ := a.CreateTag("乙", "#222222")
	third, _ := a.CreateTag("丙", "#333333")

	if err := a.ReorderTags([]int64{third, first, second}); err != nil {
		t.Fatal(err)
	}
	tags, err := a.ListTags()
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, tg := range tags {
		got = append(got, tg.Name)
	}
	if strings.Join(got, ",") != "丙,甲,乙" {
		t.Fatalf("排序结果: %v", got)
	}

	var nilApp App
	if err := nilApp.ReorderTags([]int64{first}); err == nil {
		t.Fatal("store 未初始化应该报错")
	}
}

// GetBooks 的入参 JSON 契约（前端传 tag_ids / tag_mode）。
func TestBookQueryTagModeJSONContract(t *testing.T) {
	raw, err := json.Marshal(BookQueryInput{
		TagIDs:  []int64{1, 2},
		TagMode: db.TagFilterAnd,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"tag_ids"`, `"tag_mode"`, `"and"`} {
		if !strings.Contains(string(raw), key) {
			t.Fatalf("入参缺少 %s: %s", key, raw)
		}
	}

	// 端到端：默认（空 tag_mode）= 或，传 and 时要求同时命中
	a := tagApp(t)
	books := seedBindingBooks(t, a, 2)
	tid, _ := a.CreateTag("科幻", "#111111")
	other, _ := a.CreateTag("小说", "#222222")
	if err := a.store.SetBookTags(books[0], []int64{tid, other}); err != nil {
		t.Fatal(err)
	}
	if err := a.store.SetBookTags(books[1], []int64{tid}); err != nil {
		t.Fatal(err)
	}

	orList, err := a.GetBooks(BookQueryInput{TagIDs: []int64{tid, other}})
	if err != nil {
		t.Fatal(err)
	}
	if len(orList) != 2 {
		t.Fatalf("默认应为「或」，得到 %d 本", len(orList))
	}
	andList, err := a.GetBooks(BookQueryInput{TagIDs: []int64{tid, other}, TagMode: db.TagFilterAnd})
	if err != nil {
		t.Fatal(err)
	}
	if len(andList) != 1 || andList[0].ID != books[0] {
		t.Fatalf("and 应为 1 本（第 1 本），得到 %d 本", len(andList))
	}
}

func mustJSON(t *testing.T, fn func() (any, error)) any {
	t.Helper()
	v, err := fn()
	if err != nil {
		t.Fatal(err)
	}
	return v
}
