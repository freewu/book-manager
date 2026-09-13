package main

import (
	"encoding/json"
	"path/filepath"
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
