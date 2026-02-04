import { useState, useEffect } from "react";
import { bookmarkApi } from "./api";
import type { Bookmark, CreateBookmarkInput, Reminder } from "./types";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Toast } from "./Toast";
import "./App.css";
import "./DarkTheme.css";
import "./Shortcuts.css";
import "./FolderView.css";

function App() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showReminders, setShowReminders] = useState(false);
  const [formData, setFormData] = useState<CreateBookmarkInput>({
    title: "",
    url: "",
    category: "",
    tags: [],
    notes: "",
    reminder: undefined,
  });
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderFrequency, setReminderFrequency] = useState<"daily" | "weekly" | "custom" | "once">("daily");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [reminderDays, setReminderDays] = useState<number[]>([]);
  const [reminderInterval, setReminderInterval] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [showHelp, setShowHelp] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'folder'>('grid');

  useEffect(() => {
    loadBookmarks();

    // Listen for reminder events from backend
    const unlisten = listen<Bookmark>("reminder-triggered", (event) => {
      const bookmark = event.payload;
      if (confirm(`提醒：该去 ${bookmark.title} 签到了！\n\n是否标记为已完成？`)) {
        bookmarkApi.markReminderCompleted(bookmark.id!);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const loadBookmarks = async () => {
    try {
      if (showReminders) {
        const data = await bookmarkApi.getBookmarksWithReminders();
        setBookmarks(data);
      } else {
        const data = await bookmarkApi.getAllBookmarks();
        setBookmarks(data);
      }
    } catch (error) {
      setToast({ message: "加载失败：" + String(error), type: "error" });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadBookmarks();
      return;
    }
    try {
      const results = await bookmarkApi.searchBookmarks(searchQuery);
      setBookmarks(results);
      setShowReminders(false);
    } catch (error) {
      setToast({ message: "搜索失败：" + String(error), type: "error" });
    }
  };

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        const updateData = {
          id: editingId,
          title: formData.title,
          url: formData.url,
          category: formData.category || undefined,
          tags: formData.tags.filter(t => t.trim()),
          notes: formData.notes || undefined,
          reminder: reminderEnabled ? buildReminder() : undefined,
        };

        await bookmarkApi.updateBookmark(updateData);
        setToast({ message: "书签更新成功！", type: "success" });
      } else {
        const bookmarkData: CreateBookmarkInput = {
          title: formData.title,
          url: formData.url,
          category: formData.category || undefined,
          tags: formData.tags.filter(t => t.trim()),
          notes: formData.notes || undefined,
          reminder: reminderEnabled ? buildReminder() : undefined,
        };

        await bookmarkApi.createBookmark(bookmarkData);
        setToast({ message: "书签保存成功！", type: "success" });
      }

      resetForm();
      await loadBookmarks();
    } catch (error) {
      setToast({ message: "保存失败：" + String(error), type: "error" });
    }
  };

  const buildReminder = (): Reminder => {
    let frequency;
    if (reminderFrequency === "daily") {
      frequency = { type: "daily" as const };
    } else if (reminderFrequency === "weekly") {
      frequency = { type: "weekly" as const };
    } else if (reminderFrequency === "custom") {
      frequency = { type: "custom" as const, interval_days: reminderInterval };
    } else {
      frequency = { type: "once" as const };
    }

    return {
      enabled: true,
      frequency,
      time: reminderTime,
      days: reminderDays,
    };
  };

  const resetForm = () => {
    setFormData({
      title: "",
      url: "",
      category: "",
      tags: [],
      notes: "",
    });
    setReminderEnabled(false);
    setReminderFrequency("daily");
    setReminderTime("09:00");
    setReminderDays([]);
    setReminderInterval(1);
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleEditBookmark = (bookmark: Bookmark) => {
    setFormData({
      title: bookmark.title,
      url: bookmark.url,
      category: bookmark.category || "",
      tags: bookmark.tags,
      notes: bookmark.notes || "",
    });

    if (bookmark.reminder) {
      setReminderEnabled(bookmark.reminder.enabled);
      setReminderTime(bookmark.reminder.time);
      setReminderDays(bookmark.reminder.days);

      const freq = bookmark.reminder.frequency;
      if (freq.type === "daily") {
        setReminderFrequency("daily");
      } else if (freq.type === "weekly") {
        setReminderFrequency("weekly");
      } else if (freq.type === "custom") {
        setReminderFrequency("custom");
        setReminderInterval(freq.interval_days);
      } else {
        setReminderFrequency("once");
      }
    }

    setEditingId(bookmark.id!);
    setShowAddForm(true);
  };

  const handleDeleteBookmark = async (id: number) => {
    if (!confirm("确定要删除这个书签吗？")) return;

    try {
      await bookmarkApi.deleteBookmark(id);
      await loadBookmarks();
      setToast({ message: "书签已删除", type: "success" });
    } catch (error) {
      setToast({ message: "删除失败：" + String(error), type: "error" });
    }
  };

  const handleOpenUrl = async (url: string, bookmarkId: number) => {
    try {
      await bookmarkApi.recordVisit(bookmarkId);
      await bookmarkApi.openUrl(url);
      loadBookmarks();
    } catch (error) {
      setToast({ message: "打开失败：" + String(error), type: "error" });
    }
  };

  const toggleReminderDay = (day: number) => {
    setReminderDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const weekDays = [
    { value: 0, label: "日" },
    { value: 1, label: "一" },
    { value: 2, label: "二" },
    { value: 3, label: "三" },
    { value: 4, label: "四" },
    { value: 5, label: "五" },
    { value: 6, label: "六" },
  ];

  const handleMarkCompleted = async (bookmarkId: number) => {
    try {
      await bookmarkApi.markReminderCompleted(bookmarkId);
      setToast({ message: "已标记为完成", type: "success" });
      loadBookmarks();
    } catch (error) {
      setToast({ message: "标记失败：" + String(error), type: "error" });
    }
  };

  const handleImportBookmarks = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'HTML',
          extensions: ['html', 'htm']
        }]
      });

      if (selected && typeof selected === 'string') {
        const count = await bookmarkApi.importBookmarks(selected);
        setToast({ message: `成功导入 ${count} 个书签！`, type: "success" });
        loadBookmarks();
      }
    } catch (error) {
      setToast({ message: "导入失败：" + String(error), type: "error" });
    }
  };

  const handleExportBookmarks = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        filters: [{
          name: 'HTML',
          extensions: ['html']
        }],
        defaultPath: 'bookmarks.html'
      });

      if (filePath) {
        const count = await bookmarkApi.exportBookmarks(filePath);
        setToast({ message: `成功导出 ${count} 个书签！`, type: "success" });
      }
    } catch (error) {
      setToast({ message: "导出失败：" + String(error), type: "error" });
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, [showReminders]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N: 新建书签
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (!showAddForm) {
          resetForm();
          setShowAddForm(true);
        }
      }

      // Ctrl/Cmd + F: 搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-bar input') as HTMLInputElement;
        searchInput?.focus();
      }

      // Esc: 取消/关闭
      if (e.key === 'Escape') {
        if (showAddForm) {
          resetForm();
        }
        if (toast) {
          setToast(null);
        }
      }

      // Ctrl/Cmd + E: 导出
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        handleExportBookmarks();
      }

      // Ctrl/Cmd + I: 导入
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        handleImportBookmarks();
      }

      // Ctrl/Cmd + T: 切换主题
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        toggleTheme();
      }

      // ?: 显示快捷键帮助
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setShowHelp(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddForm, toast, theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // 按分类分组书签
  const groupedBookmarks = () => {
    const groups: { [key: string]: Bookmark[] } = {};
    bookmarks.forEach(bookmark => {
      const category = bookmark.category || '未分类';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(bookmark);
    });
    return groups;
  };

  const renderBookmarkCard = (bookmark: Bookmark) => (
    <div key={bookmark.id} className="bookmark-card">
      <div className="bookmark-header">
        <img
          src={`https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`}
          alt=""
          className="bookmark-favicon"
          onError={(e) => {
            e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23667eea"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
          }}
        />
        <h3>{bookmark.title}</h3>
        {bookmark.reminder?.enabled && (
          <span className="reminder-badge" title="已设置提醒">🔔</span>
        )}
      </div>
      <p className="bookmark-url">🔗 {bookmark.url}</p>
      {bookmark.category && (
        <span className="category-tag">📁 {bookmark.category}</span>
      )}
      {bookmark.tags.length > 0 && (
        <div className="tags">
          {bookmark.tags.map((tag, idx) => (
            <span key={idx} className="tag">
              🏷️ {tag}
            </span>
          ))}
        </div>
      )}
      {bookmark.notes && (
        <p className="notes">💭 {bookmark.notes}</p>
      )}
      {bookmark.reminder?.enabled && (
        <div className="reminder-info">
          <small>
            ⏰ {bookmark.reminder.time} •{" "}
            {bookmark.reminder.frequency.type === "daily" && "每日提醒"}
            {bookmark.reminder.frequency.type === "weekly" && "每周提醒"}
            {bookmark.reminder.frequency.type === "custom" &&
              `每 ${bookmark.reminder.frequency.interval_days} 天`}
            {bookmark.reminder.frequency.type === "once" && "一次性提醒"}
          </small>
        </div>
      )}
      <div className="bookmark-stats">
        <small>
          👁️ 访问 {bookmark.visit_count} 次
          {bookmark.last_visited && (
            <> • 最近: {new Date(bookmark.last_visited).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</>
          )}
        </small>
      </div>
      <div className="bookmark-actions">
        <button onClick={() => handleOpenUrl(bookmark.url, bookmark.id!)} title="打开网站">
          🚀 打开
        </button>
        {showReminders && (
          <button
            className="btn-success"
            onClick={() => handleMarkCompleted(bookmark.id!)}
            title="标记为已完成"
          >
            ✅ 完成
          </button>
        )}
        <button onClick={() => handleEditBookmark(bookmark)} title="编辑书签">
          ✏️ 编辑
        </button>
        <button onClick={() => handleDeleteBookmark(bookmark.id!)} title="删除书签">
          🗑️ 删除
        </button>
      </div>
    </div>
  );

  return (
    <div className="app">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <header className="header">
        <div className="header-top">
          <h1>📚 书签管理器</h1>
          <div className="header-actions">
            <button className="theme-toggle" onClick={toggleTheme} title="切换主题 (Ctrl+T)">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button className="help-button" onClick={() => setShowHelp(true)} title="快捷键帮助 (?)">
              ❓
            </button>
          </div>
        </div>
        <div className="search-bar">
          <input
            type="text"
            placeholder="🔍 搜索书签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch}>🔍 搜索</button>
          <button onClick={() => setShowReminders(!showReminders)}>
            {showReminders ? "📋 显示全部" : "🔔 今日提醒"}
          </button>
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'folder' : 'grid')}>
            {viewMode === 'grid' ? "📁 文件夹视图" : "📊 网格视图"}
          </button>
          <button onClick={handleImportBookmarks}>
            📥 导入书签
          </button>
          <button onClick={handleExportBookmarks}>
            📤 导出书签
          </button>
          <button onClick={() => {
            resetForm();
            setShowAddForm(!showAddForm);
          }}>
            {showAddForm ? "❌ 取消" : "➕ 添加书签"}
          </button>
        </div>
      </header>

      {showAddForm && (
        <div className="add-form">
          <h2>{editingId ? "✏️ 编辑书签" : "➕ 添加新书签"}</h2>
          <form onSubmit={handleAddBookmark}>
            <input
              type="text"
              placeholder="📌 标题 *"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
            />
            <input
              type="url"
              placeholder="🔗 URL *"
              value={formData.url}
              onChange={(e) =>
                setFormData({ ...formData, url: e.target.value })
              }
              required
            />
            <input
              type="text"
              placeholder="📁 分类（可选）"
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="🏷️ 标签（用逗号分隔，可选）"
              value={formData.tags.join(", ")}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tags: e.target.value.split(",").map((t) => t.trim()).filter(t => t),
                })
              }
            />
            <textarea
              placeholder="📝 备注（可选）"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
            />

            <div className="reminder-section">
              <h3>
                <label>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                  />
                  🔔 启用提醒
                </label>
              </h3>

              {reminderEnabled && (
                <div className="reminder-config">
                  <div className="form-group">
                    <label>⏰ 提醒频率</label>
                    <select
                      value={reminderFrequency}
                      onChange={(e) =>
                        setReminderFrequency(
                          e.target.value as "daily" | "weekly" | "custom" | "once"
                        )
                      }
                    >
                      <option value="daily">每日提醒</option>
                      <option value="weekly">每周提醒</option>
                      <option value="custom">自定义间隔</option>
                      <option value="once">一次性提醒</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>🕐 提醒时间</label>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                    />
                  </div>

                  {reminderFrequency === "weekly" && (
                    <div className="form-group">
                      <label>📅 选择星期</label>
                      <div className="weekday-selector">
                        {weekDays.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            className={
                              reminderDays.includes(day.value)
                                ? "weekday-btn active"
                                : "weekday-btn"
                            }
                            onClick={() => toggleReminderDay(day.value)}
                          >
                            周{day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {reminderFrequency === "custom" && (
                    <div className="form-group">
                      <label>📆 间隔天数</label>
                      <input
                        type="number"
                        min="1"
                        value={reminderInterval}
                        onChange={(e) =>
                          setReminderInterval(parseInt(e.target.value) || 1)
                        }
                        placeholder="例如：7 表示每 7 天提醒一次"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit">
                {editingId ? "💾 更新书签" : "💾 保存书签"}
              </button>
              <button type="button" onClick={resetForm}>
                ❌ 取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bookmarks-grid">
        {bookmarks.length === 0 ? (
          <p className="empty-message">
            {showReminders
              ? "📭 还没有设置提醒的书签"
              : "📚 还没有书签，点击「添加书签」开始吧！"}
          </p>
        ) : viewMode === 'grid' ? (
          bookmarks.map(renderBookmarkCard)
        ) : (
          Object.entries(groupedBookmarks()).map(([category, categoryBookmarks]) => (
            <div key={category} className="folder-group">
              <div className="folder-header">
                <h2>📁 {category}</h2>
                <span className="folder-count">{categoryBookmarks.length} 个书签</span>
              </div>
              <div className="folder-bookmarks">
                {categoryBookmarks.map(renderBookmarkCard)}
              </div>
            </div>
          ))
        )}
      </div>

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>⌨️ 快捷键帮助</h2>
            <div className="shortcuts-list">
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>N</kbd>
                <span>新建书签</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>F</kbd>
                <span>搜索书签</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>E</kbd>
                <span>导出书签</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>I</kbd>
                <span>导入书签</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>T</kbd>
                <span>切换主题</span>
              </div>
              <div className="shortcut-item">
                <kbd>Esc</kbd>
                <span>取消/关闭</span>
              </div>
              <div className="shortcut-item">
                <kbd>?</kbd>
                <span>显示此帮助</span>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowHelp(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
