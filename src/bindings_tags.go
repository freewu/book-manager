package main

import (
	"errors"

	"bookmanager/internal/models"
)

// 说明：标签（tag）相关绑定。
//
// 冻结（frozen）语义：冻结的标签保留已有的打标关系，但不再出现在
// 书籍详情的标签选择里；标签页可以冻结 / 解冻，书架筛选条只在它已被
// 选中时才显示。

// ListTags returns all tags with book counts (frozen ones included).
func (a *App) ListTags() ([]models.Tag, error) {
	if a.store == nil {
		return nil, errors.New("database not ready")
	}
	return a.store.ListTags()
}

// CreateTag adds a new tag. Empty / duplicate names are rejected.
func (a *App) CreateTag(name, color string) (int64, error) {
	if a.store == nil {
		return 0, errors.New("database not ready")
	}
	return a.store.CreateTag(name, color)
}

// UpdateTag renames / recolors a tag.
func (a *App) UpdateTag(id int64, name, color string) error {
	if a.store == nil {
		return errors.New("database not ready")
	}
	return a.store.UpdateTag(id, name, color)
}

// FreezeTag freezes (frozen=true) or unfreezes a tag.
func (a *App) FreezeTag(id int64, frozen bool) error {
	if a.store == nil {
		return errors.New("database not ready")
	}
	return a.store.SetTagFrozen(id, frozen)
}

// DeleteTag removes a tag (book associations are dropped).
func (a *App) DeleteTag(id int64) error {
	if a.store == nil {
		return errors.New("database not ready")
	}
	return a.store.DeleteTag(id)
}

// ReorderTags 拖拽排序：按传入的 id 顺序重写标签顺序（标签页里拖拽触发）。
func (a *App) ReorderTags(ids []int64) error {
	if a.store == nil {
		return errors.New("database not ready")
	}
	return a.store.ReorderTags(ids)
}

// SetBookTags replaces a book's tag set.
func (a *App) SetBookTags(bookID int64, tagIDs []int64) error {
	if a.store == nil {
		return errors.New("database not ready")
	}
	return a.store.SetBookTags(bookID, tagIDs)
}

// SetBooksTags 批量设置标签：mode 取 "add"（追加）/ "remove"（移除）/ "replace"（替换），
// 整批一个事务，失败全部回滚。
func (a *App) SetBooksTags(bookIDs []int64, tagIDs []int64, mode string) error {
	if a.store == nil {
		return errors.New("database not ready")
	}
	return a.store.SetBooksTags(bookIDs, tagIDs, mode)
}
