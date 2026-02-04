use anyhow::Result;
use scraper::{Html, Selector};
use std::fs;

#[derive(Debug, Clone)]
pub struct ImportedBookmark {
    pub title: String,
    pub url: String,
    pub folder: Option<String>,
}

pub fn parse_html_bookmarks(file_path: &str) -> Result<Vec<ImportedBookmark>> {
    let html = fs::read_to_string(file_path)?;
    let document = Html::parse_document(&html);

    let mut bookmarks = Vec::new();
    let mut current_folder: Option<String> = None;

    // 选择器
    let link_selector = Selector::parse("a").unwrap();
    let h3_selector = Selector::parse("h3").unwrap();
    let dl_selector = Selector::parse("dl").unwrap();

    // 遍历所有 DL 元素（文件夹）
    for dl in document.select(&dl_selector) {
        // 查找文件夹名称（H3）
        if let Some(h3) = dl.select(&h3_selector).next() {
            current_folder = Some(h3.text().collect::<String>().trim().to_string());
        }

        // 查找该文件夹下的所有链接
        for link in dl.select(&link_selector) {
            if let Some(href) = link.value().attr("href") {
                let title = link.text().collect::<String>().trim().to_string();

                if !href.is_empty() && !title.is_empty() {
                    bookmarks.push(ImportedBookmark {
                        title,
                        url: href.to_string(),
                        folder: current_folder.clone(),
                    });
                }
            }
        }
    }

    // 如果没有找到 DL 结构，尝试直接查找所有链接
    if bookmarks.is_empty() {
        for link in document.select(&link_selector) {
            if let Some(href) = link.value().attr("href") {
                let title = link.text().collect::<String>().trim().to_string();

                if !href.is_empty() && !title.is_empty() && href.starts_with("http") {
                    bookmarks.push(ImportedBookmark {
                        title,
                        url: href.to_string(),
                        folder: None,
                    });
                }
            }
        }
    }

    Ok(bookmarks)
}
