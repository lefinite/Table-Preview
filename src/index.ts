import $ from 'jquery';
import { bitable, FieldType } from '@lark-base-open/js-sdk';
import './index.scss';
import './locales/i18n';
import i18next from 'i18next';

interface RowData {
  recordId: string;
  fields: Record<string, any>;
}

interface FieldMeta {
  id: string;
  name: string;
  type: FieldType;
}

class TableRowPreview {
  private static instance: TableRowPreview | null = null;
  private table: any = null;
  private view: any = null;
  private selection: any = null;
  private fieldMetaList: any[] = [];
  private currentRecordId: string | null = null;
  private currentTableId: string | null = null;
  private tableName: string = '';
  private currentFieldValues: { [fieldId: string]: string } = {};
  private selectionChangeHandler: ((event: any) => Promise<void>) | null = null;
  private isInitialized: boolean = false;
  private lastPreviewedFieldId: string | null = null; // 记录上次预览的字段ID
  private recordIdList: string[] = []; // 缓存当前视图的记录ID列表
  private currentRecordIndex: number = -1; // 当前记录在列表中的索引

  private constructor() {
    this.init();
  }

  public static getInstance(): TableRowPreview {
    if (!TableRowPreview.instance) {
      TableRowPreview.instance = new TableRowPreview();
    }
    return TableRowPreview.instance;
  }

  private cleanup() {
    // 注意：飞书API目前不支持移除选择变化监听器
    // 通过单例模式和初始化标志来避免重复注册
    this.selectionChangeHandler = null;
    
    // 清理键盘事件监听器
    $(document).off('keydown.tableNavigation');
  }

  private showLoading(): void {
    $('#statusCard').hide();
    $('#loadingCard').show();
    $('#previewCard').hide();
    $('#errorCard').hide();
  }

  private showNoSelection(): void {
    $('#statusCard').show();
    $('#loadingCard').hide();
    $('#previewCard').hide();
    $('#errorCard').hide();
  }

  private showError(message: string): void {
    $('#statusCard').hide();
    $('#loadingCard').hide();
    $('#previewCard').hide();
    $('#errorCard').show();
    $('#errorMessage').text(message);
  }

  private showRowContent(): void {
    $('#statusCard').hide();
    $('#loadingCard').hide();
    $('#previewCard').show();
    $('#errorCard').hide();
  }

  private formatFieldValue(fieldType: FieldType, value: any): string {
    if (value === null || value === undefined || value === '') {
      return `<span class="empty-value">${i18next.t('emptyValue')}</span>`;
    }

    switch (fieldType) {
      case FieldType.Text:
      case FieldType.Barcode:
      case FieldType.Email:
      case FieldType.Phone:
      case FieldType.Url:
        // 处理富文本内容
        if (Array.isArray(value)) {
          return this.formatRichText(value);
        }
        // 处理对象类型的文本字段
        if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return this.escapeHtml(String(value));
      
      case FieldType.Number:
      case FieldType.Currency:
      case FieldType.Rating:
      case FieldType.Progress:
        // 处理对象类型的数字字段
        if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return String(value);
      
      case FieldType.SingleSelect:
        if (typeof value === 'object' && value.text) {
          return `<span class="option-item">${this.escapeHtml(value.text)}</span>`;
        } else if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return value ? `<span class="option-item">${this.escapeHtml(String(value))}</span>` : '';
      
      case FieldType.MultiSelect:
        if (Array.isArray(value)) {
          const options = value.map(item => {
            if (typeof item === 'object' && item.text) {
              return `<span class="option-item">${this.escapeHtml(item.text)}</span>`;
            } else if (typeof item === 'object') {
              return `<span class="option-item">${this.escapeHtml(JSON.stringify(item))}</span>`;
            }
            return `<span class="option-item">${this.escapeHtml(String(item))}</span>`;
          }).join('');
          return `<div class="option-container">${options}</div>`;
        } else if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return '';
      
      case FieldType.DateTime:
      case FieldType.CreatedTime:
      case FieldType.ModifiedTime:
        if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return value ? new Date(value).toLocaleDateString('zh-CN') : `<span class="empty-value">${i18next.t('emptyValue')}</span>`;
      
      case FieldType.Checkbox:
        if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return value ? '✅ 是' : '❌ 否';
      
      case FieldType.User:
      case FieldType.CreatedUser:
      case FieldType.ModifiedUser:
        if (Array.isArray(value)) {
          return value.map(user => {
            if (typeof user === 'object' && user.name) {
              return `<span class="user-item">${this.escapeHtml(user.name)}</span>`;
            } else if (typeof user === 'object') {
              return `<span class="user-item">${this.escapeHtml(JSON.stringify(user))}</span>`;
            }
            return `<span class="user-item">${this.escapeHtml(String(user))}</span>`;
          }).join(' ');
        } else if (typeof value === 'object' && value.name) {
          return `<span class="user-item">${this.escapeHtml(value.name)}</span>`;
        } else if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return value ? `<span class="user-item">${this.escapeHtml(String(value))}</span>` : '';
      
      case FieldType.Attachment:
        if (Array.isArray(value)) {
          return value.map(attachment => {
            if (typeof attachment === 'object' && attachment.name) {
              const fileName = attachment.name;
              const isImage = this.isImageFile(fileName);
              
              if (isImage && attachment.url) {
                return `<div class="attachment-item image-attachment">
                  <img src="${this.escapeHtml(attachment.url)}" alt="${this.escapeHtml(fileName)}" class="attachment-image" loading="lazy" />
                  <span class="attachment-name">📷 ${this.escapeHtml(fileName)}</span>
                </div>`;
              } else {
                return `<span class="attachment-item">📎 ${this.escapeHtml(fileName)}</span>`;
              }
            } else if (typeof attachment === 'object') {
              return `<span class="attachment-item">${this.escapeHtml(JSON.stringify(attachment))}</span>`;
            }
            return `<span class="attachment-item">📎 ${this.escapeHtml(String(attachment))}</span>`;
          }).join('<br>');
        } else if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return value ? `<span class="attachment-item">📎 ${this.escapeHtml(String(value))}</span>` : '';
      
      case FieldType.SingleLink:
      case FieldType.DuplexLink:
        if (Array.isArray(value)) {
          return value.map(link => {
            if (typeof link === 'object' && link.text) {
              return `<span class="link-item">🔗 ${this.escapeHtml(link.text)}</span>`;
            } else if (typeof link === 'object') {
              return `<span class="link-item">${this.escapeHtml(JSON.stringify(link))}</span>`;
            }
            return `<span class="link-item">🔗 ${this.escapeHtml(String(link))}</span>`;
          }).join('<br>');
        } else if (typeof value === 'object' && value.text) {
          return `<span class="link-item">🔗 ${this.escapeHtml(value.text)}</span>`;
        } else if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return value ? `<span class="link-item">🔗 ${this.escapeHtml(String(value))}</span>` : '';
      
      case FieldType.Lookup:
        // 处理查找引用字段的特殊展示
        if (Array.isArray(value)) {
          return this.formatLookupField(value);
        } else if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return this.escapeHtml(String(value));
      
      case FieldType.Formula:
        // 公式字段特殊处理：优先使用 text 或 display_value 属性
        if (typeof value === 'object' && value !== null) {
          // 尝试获取显示值
          if (value.text !== undefined) {
            return this.escapeHtml(String(value.text));
          }
          if (value.display_value !== undefined) {
            return this.escapeHtml(String(value.display_value));
          }
          if (value.displayValue !== undefined) {
            return this.escapeHtml(String(value.displayValue));
          }
          // 如果没有找到显示值属性，尝试直接使用value属性
          if (value.value !== undefined) {
            return this.escapeHtml(String(value.value));
          }
          // 最后降级到JSON显示
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return this.escapeHtml(String(value));
      
      case FieldType.AutoNumber:
      case FieldType.Location:
      case FieldType.GroupChat:
      case FieldType.Object:
      default:
        if (typeof value === 'object') {
          return `<pre class="json-value">${this.escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
        }
        return this.escapeHtml(String(value));
    }
  }

  private getRawTextValue(fieldType: FieldType, value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    switch (fieldType) {
      case FieldType.Text:
      case FieldType.Barcode:
      case FieldType.Email:
      case FieldType.Phone:
      case FieldType.Url:
        if (Array.isArray(value)) {
          // Url and other rich text fields
          return value.map(item => item.text || '').join('');
        }
        if (typeof value === 'object' && value !== null) {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return '[Circular Object]';
          }
        }
        return String(value);
      
      case FieldType.SingleSelect:
        if (typeof value === 'object' && value.text) {
          return value.text;
        }
        return String(value || '');
      
      case FieldType.MultiSelect:
        if (Array.isArray(value)) {
          return value.map(item => {
            if (typeof item === 'object' && item.text) {
              return item.text;
            }
            return String(item);
          }).join(', ');
        }
        return String(value || '');
      
      case FieldType.DateTime:
      case FieldType.CreatedTime:
      case FieldType.ModifiedTime:
        return value ? new Date(value).toLocaleDateString('zh-CN') : '';
      
      case FieldType.Checkbox:
        return value ? '是' : '否';
      
      case FieldType.User:
      case FieldType.CreatedUser:
      case FieldType.ModifiedUser:
        if (Array.isArray(value)) {
          return value.map(user => {
            if (typeof user === 'object' && user.name) {
              return user.name;
            }
            return String(user);
          }).join(', ');
        } else if (typeof value === 'object' && value.name) {
          return value.name;
        }
        return String(value || '');
      
      case FieldType.Attachment:
        if (Array.isArray(value)) {
          return value.map(attachment => {
            if (typeof attachment === 'object' && attachment.name) {
              return attachment.name;
            }
            return String(attachment);
          }).join(', ');
        }
        return String(value || '');
      
      case FieldType.Lookup:
        // 处理查找引用字段的文本提取
        if (Array.isArray(value)) {
          const textContents: string[] = [];
          for (const item of value) {
            if (typeof item === 'object' && item.type === 'text' && item.text) {
              // 跳过逗号分隔符
              if (item.text.trim() === ',') {
                continue;
              }
              textContents.push(item.text.trim());
            } else if (typeof item === 'string') {
              // 跳过逗号分隔符
              if (item.trim() === ',') {
                continue;
              }
              textContents.push(item.trim());
            }
          }
          return textContents.join('\n');
        }
        return String(value || '');
      
      case FieldType.Formula:
        // 公式字段特殊处理：优先使用 text 或 display_value 属性
        if (typeof value === 'object' && value !== null) {
          // 尝试获取显示值
          if (value.text !== undefined) {
            return String(value.text);
          }
          if (value.display_value !== undefined) {
            return String(value.display_value);
          }
          if (value.displayValue !== undefined) {
            return String(value.displayValue);
          }
          // 如果没有找到显示值属性，尝试直接使用value属性
          if (value.value !== undefined) {
            return String(value.value);
          }
          // 最后降级到JSON显示
          try {
            return JSON.stringify(value);
          } catch {
            return '[Circular Object]';
          }
        }
        return String(value);
      
      default:
        if (typeof value === 'object' && value !== null) {
          try {
            return JSON.stringify(value);
          } catch {
            return '[Circular Object]';
          }
        }
        return String(value);
    }
  }

  // 判断字段类型是否支持编辑
  private isEditableTextType(fieldType: FieldType): boolean {
    // 支持编辑的字段类型：文本、数字、电话号码
    return [FieldType.Text, FieldType.Number, FieldType.Phone].includes(fieldType);
  }

  // 判断文件是否为图片类型
  private isImageFile(fileName: string): boolean {
    if (!fileName) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return imageExtensions.includes(extension);
  }

  // 判断是否为文本类型字段（可复制的字段）
  private isTextTypeField(fieldType: FieldType): boolean {
    // 定义可复制的文本类型字段
    return [
      FieldType.Text,
      FieldType.Barcode,
      FieldType.Email,
      FieldType.Phone,
      FieldType.Url,
      FieldType.Number,
      FieldType.Currency,
      FieldType.Rating,
      FieldType.Progress,
      FieldType.SingleSelect,
      FieldType.MultiSelect,
      FieldType.DateTime,
      FieldType.CreatedTime,
      FieldType.ModifiedTime,
      FieldType.Checkbox,
      FieldType.User,
      FieldType.CreatedUser,
      FieldType.ModifiedUser,
      FieldType.Formula,
      FieldType.Lookup,
      FieldType.AutoNumber,
      FieldType.Location,
      FieldType.GroupChat
    ].includes(fieldType);
  }

  // 检测文本是否包含Markdown语法
  private containsMarkdown(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    // Markdown语法检测规则
    const markdownPatterns = [
      /^#{1,6}\s+/m,                    // 标题 # ## ### 等
      /\*\*.*?\*\*/,                    // 粗体 **text**
      /\*.*?\*/,                       // 斜体 *text*
      /__.*?__/,                       // 粗体 __text__
      /_.*?_/,                         // 斜体 _text_
      /~~.*?~~/,                       // 删除线 ~~text~~
      /`.*?`/,                         // 行内代码 `code`
      /```[\s\S]*?```/,                // 代码块 ```code```
      /^\s*[-*+]\s+/m,                 // 无序列表 - * +
      /^\s*\d+\.\s+/m,                 // 有序列表 1. 2.
      /^\s*>\s+/m,                     // 引用 >
      /\[.*?\]\(.*?\)/,                // 链接 [text](url)
      /!\[.*?\]\(.*?\)/,               // 图片 ![alt](url)
      /^\s*\|.*\|\s*$/m,               // 表格 |col1|col2|
      /^\s*[-=]{3,}\s*$/m,             // 分隔线 --- ===
      /^\s*\*{3,}\s*$/m,               // 分隔线 ***
    ];

    return markdownPatterns.some(pattern => pattern.test(text));
  }



  // 显示图片模态框
  private showImageModal(imgSrc: string, imgAlt: string): void {
    // 移除已存在的模态框
    $('.image-modal').remove();
    
    // 创建模态框HTML
    const modalHtml = `
      <div class="image-modal">
        <div class="image-modal-backdrop"></div>
        <div class="image-modal-content">
          <button class="image-modal-close">&times;</button>
          <img src="${this.escapeHtml(imgSrc)}" alt="${this.escapeHtml(imgAlt)}" class="image-modal-img" />
          <div class="image-modal-caption">${this.escapeHtml(imgAlt)}</div>
        </div>
      </div>
    `;
    
    // 添加到页面
    $('body').append(modalHtml);
    
    // 绑定关闭事件
    $('.image-modal-close, .image-modal-backdrop').on('click', () => {
      $('.image-modal').remove();
    });
    
    // ESC键关闭
    $(document).on('keydown.imageModal', (e) => {
      if (e.key === 'Escape') {
        $('.image-modal').remove();
        $(document).off('keydown.imageModal');
      }
    });
  }

  // 显示Markdown预览模态框
  private showMarkdownPreview(markdownText: string, fieldId?: string): void {
    // 移除已存在的预览模态框
    $('.markdown-preview-modal').remove();
    
    // 如果提供了字段ID，则记录为上次预览的字段ID
    if (fieldId) {
      this.lastPreviewedFieldId = fieldId;
    }
    
    // 检查是否包含Markdown语法
    const isMarkdown = this.containsMarkdown(markdownText);
    
    // 渲染Markdown为HTML
    const renderedHtml = this.renderMarkdown(markdownText);
    
    // 创建模态框HTML
    const modalHtml = `
      <div class="markdown-preview-modal">
        <div class="markdown-preview-backdrop"></div>
        <div class="markdown-preview-content">
          <div class="markdown-preview-header">
            <h3>${isMarkdown ? 'Markdown 预览' : '文本预览'}</h3>
            <button class="markdown-preview-close"></button>
          </div>
          <div class="markdown-preview-body">
            ${renderedHtml}
          </div>
        </div>
      </div>
    `;
    
    // 添加到页面
    $('body').append(modalHtml);
    
    // 绑定关闭事件
    $('.markdown-preview-close, .markdown-preview-backdrop').on('click', () => {
      $('.markdown-preview-modal').remove();
    });
    
    // 绑定预览框内图片点击事件
    $('.markdown-preview-body img').on('click', (e) => {
      const imgSrc = $(e.target).attr('src') || '';
      const imgAlt = $(e.target).attr('alt') || '';
      if (imgSrc) {
        this.showImageModal(imgSrc, imgAlt);
      }
    });
    
    // ESC键关闭
    $(document).on('keydown.markdownPreview', (e) => {
      if (e.key === 'Escape') {
        $('.markdown-preview-modal').remove();
        $(document).off('keydown.markdownPreview');
      }
    });
  }

  // 渲染Markdown为HTML
  private renderMarkdown(markdownText: string): string {
    if (!markdownText) {
      return '<p class="empty-content">无内容</p>';
    }
    
    // 检查是否包含Markdown语法
    const isMarkdown = this.containsMarkdown(markdownText);
    
    // 如果不是Markdown内容，则简单处理换行并返回
    if (!isMarkdown) {
      // 转义HTML特殊字符并处理换行
      const plainText = this.escapeHtml(markdownText);
      return `<div class="plain-text">${plainText.replace(/\n/g, '<br>')}</div>`;
    }

    // 转义HTML特殊字符
    let html = this.escapeHtml(markdownText);
    
    // 保存代码块，以防止其中的内容被其他规则处理
    const codeBlocks: string[] = [];
    html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (match, language, code) => {
      const id = codeBlocks.length;
      const languageClass = language ? ` class="language-${language.trim()}"` : '';
      codeBlocks.push(`<pre><code${languageClass}>${this.escapeHtml(code.trim())}</code></pre>`);
      return `%%CODEBLOCK_${id}%%`;
    });

    // 处理表格
    html = this.processMarkdownTables(html);
    
    // 处理标题 (h1 - h6)
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
      const level = hashes.length;
      return `<h${level}>${content.trim()}</h${level}>`;
    });

    // 处理任务列表
    html = html.replace(/^\s*[-*+]\s+\[([ x])\]\s+(.+)$/gm, (match, checked, content) => {
      const checkedClass = checked === 'x' ? ' class="checked"' : '';
      return `<li${checkedClass}>${content.trim()}</li>`;
    });
    
    // 处理无序列表
    html = this.processMarkdownLists(html, /^\s*[-*+]\s+(?!\[[ x]\])(.+)$/gm, 'ul');
    
    // 处理有序列表
    html = this.processMarkdownLists(html, /^\s*\d+\.\s+(.+)$/gm, 'ol');
    
    // 处理引用块
    html = this.processMarkdownBlockquotes(html);
    
    // 处理分隔线
    html = html.replace(/^\s*[-=*]{3,}\s*$/gm, '<hr>');
    
    // 处理粗体、斜体和删除线
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    
    // 处理行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 处理链接
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // 处理图片
    html = html.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" class="markdown-image" style="cursor: pointer;" />');
    
    // 恢复代码块
    html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (match, id) => {
      return codeBlocks[parseInt(id)];
    });
    
    // 处理段落
    const paragraphs = html.split(/\n{2,}/);
    html = paragraphs.map(p => {
      // 跳过已经是HTML标签的内容
      if (p.trim().startsWith('<') && !p.trim().startsWith('<br>')) {
        return p;
      }
      // 处理段落内的换行
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    
    // 应用语法高亮的简单模拟
    html = this.applyCodeHighlighting(html);
    
    return html;
  }
  
  // 处理Markdown表格
  private processMarkdownTables(text: string): string {
    // 匹配表格结构
    return text.replace(/^([|].*[|]\s*\n[|][-:]+[-|:]*\s*\n)([|].*[|]\s*\n)*([|].*[|])/gm, (table) => {
      const rows = table.trim().split('\n');
      
      // 提取表头行
      const headerRow = rows[0];
      const headerCells = headerRow.split('|').slice(1, -1).map(cell => cell.trim());
      
      // 提取分隔行，确定对齐方式
      const separatorRow = rows[1];
      const alignments = separatorRow.split('|').slice(1, -1).map(cell => {
        const trimmed = cell.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';
        return 'left';
      });
      
      // 构建表头HTML
      let tableHtml = '<table>\n<thead>\n<tr>\n';
      headerCells.forEach((cell, index) => {
        const align = alignments[index] ? ` style="text-align: ${alignments[index]}"` : '';
        tableHtml += `<th${align}>${cell}</th>\n`;
      });
      tableHtml += '</tr>\n</thead>\n<tbody>\n';
      
      // 构建表格内容行
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
        
        tableHtml += '<tr>\n';
        cells.forEach((cell, index) => {
          const align = alignments[index] ? ` style="text-align: ${alignments[index]}"` : '';
          tableHtml += `<td${align}>${cell}</td>\n`;
        });
        tableHtml += '</tr>\n';
      }
      
      tableHtml += '</tbody>\n</table>';
      return tableHtml;
    });
  }
  
  // 处理Markdown列表
  private processMarkdownLists(text: string, pattern: RegExp, listType: 'ul' | 'ol'): string {
    // 查找连续的列表项
    const listMatches: {start: number, end: number, content: string}[] = [];
    let match;
    let lastIndex = 0;
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (pattern.test(line)) {
        // 找到列表项的开始
        if (lastIndex === 0) {
          lastIndex = i;
        }
      } else if (lastIndex > 0 && line.trim() === '') {
        // 列表结束
        listMatches.push({
          start: lastIndex,
          end: i - 1,
          content: lines.slice(lastIndex, i).join('\n')
        });
        lastIndex = 0;
      }
    }
    
    // 处理可能的最后一个列表
    if (lastIndex > 0) {
      listMatches.push({
        start: lastIndex,
        end: lines.length - 1,
        content: lines.slice(lastIndex).join('\n')
      });
    }
    
    // 替换列表
    let result = text;
    for (let i = listMatches.length - 1; i >= 0; i--) {
      const { start, end, content } = listMatches[i];
      const listItems = content.replace(pattern, '<li>$1</li>');
      const listHtml = `<${listType}>${listItems}</${listType}>`;
      
      const startPos = lines.slice(0, start).join('\n').length + (start > 0 ? 1 : 0);
      const endPos = lines.slice(0, end + 1).join('\n').length;
      
      result = result.substring(0, startPos) + listHtml + result.substring(endPos);
    }
    
    return result;
  }
  
  // 处理Markdown引用块
  private processMarkdownBlockquotes(text: string): string {
    // 查找连续的引用行
    const blockquoteMatches: {start: number, end: number, content: string}[] = [];
    let lastIndex = 0;
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*>\s+(.*)$/.test(line)) {
        // 找到引用行的开始
        if (lastIndex === 0) {
          lastIndex = i;
        }
      } else if (lastIndex > 0) {
        // 引用结束
        blockquoteMatches.push({
          start: lastIndex,
          end: i - 1,
          content: lines.slice(lastIndex, i).join('\n')
        });
        lastIndex = 0;
      }
    }
    
    // 处理可能的最后一个引用块
    if (lastIndex > 0) {
      blockquoteMatches.push({
        start: lastIndex,
        end: lines.length - 1,
        content: lines.slice(lastIndex).join('\n')
      });
    }
    
    // 替换引用块
    let result = text;
    for (let i = blockquoteMatches.length - 1; i >= 0; i--) {
      const { start, end, content } = blockquoteMatches[i];
      const blockquoteContent = content.replace(/^\s*>\s+(.*)$/gm, '$1');
      const blockquoteHtml = `<blockquote>${blockquoteContent}</blockquote>`;
      
      const startPos = lines.slice(0, start).join('\n').length + (start > 0 ? 1 : 0);
      const endPos = lines.slice(0, end + 1).join('\n').length;
      
      result = result.substring(0, startPos) + blockquoteHtml + result.substring(endPos);
    }
    
    return result;
  }
  
  // 应用简单的代码高亮
  private applyCodeHighlighting(html: string): string {
    return html.replace(/<code([^>]*)>(.*?)<\/code>/gs, (match, attrs, code) => {
      // 关键字高亮
      let highlighted = code
        .replace(/\b(function|return|if|for|while|var|let|const|class|import|export|from|async|await)\b/g, '<span class="hljs-keyword">$1</span>')
        .replace(/(\'.*?\'|\".*?\")/g, '<span class="hljs-string">$1</span>')
        .replace(/(\/\/.*?)(?:\n|$)/g, '<span class="hljs-comment">$1</span>')
        .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hljs-number">$1</span>');
      
      return `<code${attrs}>${highlighted}</code>`;
    });
  }

  // 键盘事件和失焦事件处理已移至事件委托中
  // 这个方法已被移除，使用事件委托代替

  /**
   * 计算与预览框一致的高度
   * @param content 文本内容
   * @param width 宽度（可选）
   * @returns 计算后的高度（像素）
   */
  private calculatePreviewHeight(content: string, width?: number): number {
    // 创建一个临时的预览元素，用于计算实际高度
    const tempPreview = document.createElement('div');
    tempPreview.className = 'field-value';
    tempPreview.style.position = 'absolute';
    tempPreview.style.visibility = 'hidden';
    if (width) {
      tempPreview.style.width = width + 'px';
    }
    // 确保与编辑器完全相同的文本处理方式
    tempPreview.style.whiteSpace = 'pre-wrap';
    tempPreview.style.wordBreak = 'break-word';
    tempPreview.style.overflowWrap = 'break-word';
    tempPreview.style.wordWrap = 'break-word';
    tempPreview.style.hyphens = 'none';
    tempPreview.style.unicodeBidi = 'isolate';
    tempPreview.style.padding = '12px 14px';
    tempPreview.style.paddingBottom = '12px'; // 确保底部内边距与顶部一致
    tempPreview.style.marginBottom = '0'; // 确保没有底部外边距
    tempPreview.style.boxSizing = 'border-box';
    tempPreview.style.lineHeight = '1.5';
    tempPreview.style.fontSize = '14px';
    tempPreview.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
    
    // 特殊处理换行符，确保每个换行符都能被正确计算高度
    // 这对于刚按下Enter键的情况特别重要
    let processedContent = content;
    
    // 处理空内容的情况
    if (!processedContent || processedContent.trim() === '') {
      // 添加一个空格，确保有最小高度
      tempPreview.innerHTML = '&nbsp;';
    } else {
      // 确保换行符被正确处理，特别是末尾的换行符
      // 注意：不需要额外检查末尾换行符，因为在adjustHeight中已经处理了
      tempPreview.textContent = processedContent;
    }
    
    document.body.appendChild(tempPreview);
    
    // 计算实际需要的高度
    const lineHeight = 21; // 14px字体 * 1.5行高
    const padding = 24; // 上下内边距12px * 2
    
    // 获取实际高度，包括所有内容、内边距和边框
    const actualHeight = tempPreview.offsetHeight;
    
    // 计算行数（用于调试）
    const lineCount = content.split('\n').length;
    
    // 移除临时预览元素
    document.body.removeChild(tempPreview);
    
    // 返回实际高度，不再强制最小高度为80px
    return actualHeight;
  }
  
  // 进入编辑模式
  private async enterEditMode(fieldValue: JQuery<HTMLElement>, fieldEdit: JQuery<HTMLElement>, markdownEditor: JQuery<HTMLElement>, fieldItem: JQuery<HTMLElement>, clickPosition?: number): Promise<void> {
    // 记录所有可能的滚动容器的位置
    const scrollPositions = {
      window: {
        scrollX: window.scrollX,
        scrollY: window.scrollY
      },
      body: $('body').scrollTop() ?? 0,
      html: $('html').scrollTop() ?? 0,
      documentElement: document.documentElement.scrollTop ?? 0,
      // 记录可能的父容器滚动位置
      container: $('#fieldsContainer').scrollTop() ?? 0,
      parent: fieldItem.parent().scrollTop() ?? 0
    };
    
    // 获取当前字段的最新值
    const fieldId = fieldItem.data('field-id');
    const currentValue = this.getCurrentFieldValue(fieldId);
    
    // 在修改DOM之前，创建一个MutationObserver来监听DOM变化并立即恢复滚动位置
    const observer = new MutationObserver(() => {
      this.restoreScrollPositions(scrollPositions, fieldItem);
    });
    
    // 开始观察DOM变化，特别是编辑器容器的变化
    observer.observe(document.body, { childList: true, subtree: true });
    
    fieldValue.hide();
    fieldEdit.show();
    markdownEditor.val(currentValue);
    
    // 初始化SimpleMDE编辑器，传入滚动位置以便在初始化过程中保持
    await this.initMarkdownEditor(markdownEditor[0] as HTMLTextAreaElement, fieldItem, clickPosition, scrollPositions);
    
    // 停止观察
    observer.disconnect();
    
    // 使用多个延迟尝试恢复滚动位置，确保在各种情况下都能正确恢复
    // 立即尝试恢复
    this.restoreScrollPositions(scrollPositions, fieldItem);
    
    // 短延迟恢复
    setTimeout(() => {
      this.restoreScrollPositions(scrollPositions, fieldItem);
    }, 0);
    
    // 较长延迟恢复，确保在编辑器完全初始化后恢复
    setTimeout(() => {
      this.restoreScrollPositions(scrollPositions, fieldItem);
    }, 100);
  }
  
  // 初始化Markdown编辑器
  private initMarkdownEditor(textarea: HTMLTextAreaElement, fieldItem: JQuery<HTMLElement>, clickPosition?: number, scrollPositions?: any): Promise<void> {
    return new Promise((resolve) => {
    // 检查是否已经初始化过
    if (textarea.dataset.simplemdeInitialized) {
      const simplemde = (textarea as any).simplemde;
      if (simplemde) {
        const codemirror = simplemde.codemirror;
        // 在设置光标位置前恢复滚动位置
        if (scrollPositions) {
          this.restoreScrollPositions(scrollPositions, fieldItem);
        }
        
        if (clickPosition !== undefined) {
          this.setCursorPosition(codemirror, clickPosition, scrollPositions);
        } else {
          const inputField = codemirror.getInputField();
          if (inputField && typeof inputField.focus === 'function') {
            inputField.focus({ preventScroll: true });
          } else {
            codemirror.focus({ preventScroll: true });
          }
        }
        
        // 再次恢复滚动位置
        if (scrollPositions) {
          this.restoreScrollPositions(scrollPositions, fieldItem);
        }
        resolve();
        return;
      }
    }
    
    // 动态加载SimpleMDE
    this.loadSimpleMDE().then(() => {
      const SimpleMDE = (window as any).SimpleMDE;
      if (!SimpleMDE) {
        console.error('SimpleMDE not loaded');
        return;
      }
      
      // 获取当前内容
       const currentValue = textarea.value || '';
       
       // 使用辅助函数计算高度
       const minHeight = this.calculatePreviewHeight(currentValue, textarea.offsetWidth);
      
      // 在创建编辑器前恢复滚动位置
      if (scrollPositions) {
        this.restoreScrollPositions(scrollPositions, fieldItem);
      }
      
      // 创建一个临时样式，防止编辑器初始化时的滚动
      const preventScrollStyle = document.createElement('style');
      preventScrollStyle.textContent = `
        html, body { scroll-behavior: auto !important; }
        * { scroll-behavior: auto !important; }
      `;
      document.head.appendChild(preventScrollStyle);
      
      const simplemde = new SimpleMDE({
        element: textarea,
        spellChecker: false,
        status: false,
        toolbar: false, // 隐藏工具栏
        placeholder: '请输入内容...',
        autofocus: false, // 禁用自动聚焦，避免滚动
        hideIcons: ['guide'],
        initialValue: currentValue,
        minHeight: `${minHeight}px`,
        autoDownloadFontAwesome: false,
        previewRender: function(plainText: string) {
          return plainText; // 返回纯文本，不进行Markdown渲染
        },
        renderingConfig: {
          singleLineBreaks: true, // 启用单行换行，确保与预览框一致
          codeSyntaxHighlighting: false // 禁用代码语法高亮
        },
        parsingConfig: {
          allowAtxHeaderWithoutSpace: false, // 禁用不带空格的ATX标题
          strikethrough: false, // 禁用删除线
          underscoresBreakWords: false // 禁用下划线断词
        }
      });
      
      // 移除临时样式
      document.head.removeChild(preventScrollStyle);
      
      // 在编辑器创建后立即恢复滚动位置
      if (scrollPositions) {
        this.restoreScrollPositions(scrollPositions, fieldItem);
      }
      
      // 保存SimpleMDE实例到textarea
      (textarea as any).simplemde = simplemde;
      textarea.dataset.simplemdeInitialized = 'true';

      // 手动聚焦并设置光标位置，确保使用preventScroll选项
      if (simplemde.codemirror) {
        // 再次恢复滚动位置，确保在聚焦前保持位置
        if (scrollPositions) {
          this.restoreScrollPositions(scrollPositions, fieldItem);
        }
        
        if (clickPosition !== undefined) {
          this.setCursorPosition(simplemde.codemirror, clickPosition, scrollPositions);
          // 设置光标后再次恢复滚动位置
          if (scrollPositions) {
            this.restoreScrollPositions(scrollPositions, fieldItem);
          }
        } else {
          const inputField = simplemde.codemirror.getInputField();
          if (inputField && typeof inputField.focus === 'function') {
            inputField.focus({ preventScroll: true });
          } else {
            try {
              simplemde.codemirror.focus({ preventScroll: true });
            } catch (e) {
              // 如果不支持preventScroll选项，则在聚焦后立即恢复滚动位置
              simplemde.codemirror.focus();
              if (scrollPositions) {
                this.restoreScrollPositions(scrollPositions, fieldItem);
              }
            }
          }
          // 聚焦后再次恢复滚动位置
          if (scrollPositions) {
            this.restoreScrollPositions(scrollPositions, fieldItem);
          }
        }
      }
      
      resolve();
      
      // 配置CodeMirror选项
      if (simplemde.codemirror) {
        // 移除Markdown模式
        simplemde.codemirror.setOption('mode', '');
        
        // 设置换行符处理方式，确保与预览框一致
        simplemde.codemirror.setOption('lineSeparator', '\n');
        simplemde.codemirror.setOption('lineWrapping', true);
        
        // 禁用滚动条，使编辑器高度完全适应内容
        simplemde.codemirror.setOption('scrollbarStyle', 'null');
        
        // 设置换行相关选项
        simplemde.codemirror.setOption('wordWrap', true);
        simplemde.codemirror.setOption('lineNumbers', false);
        simplemde.codemirror.setOption('viewportMargin', Infinity);
        
        // 确保不应用任何特殊格式
        const cmElement = simplemde.codemirror.getWrapperElement();
        if (cmElement) {
          cmElement.classList.add('no-markdown-highlighting');
        }
      }
      
      // 动态调整编辑器高度的函数，使其与预览框保持一致
         const self = this; // 保存this引用
         const adjustHeight = () => {
           // 获取当前内容
           const content = simplemde.value();
           
           // 获取当前光标位置，用于判断是否刚按下Enter键
           const cursor = simplemde.codemirror.getCursor();
           const lineContent = simplemde.codemirror.getLine(cursor.line) || '';
           
           // 检测是否刚按下Enter键的情况
           // 1. 通过enterKeyPressed标记判断
           // 2. 当前行为空
           // 3. 光标在行首
           const isEnterKeyPressed = simplemde.codemirror.enterKeyPressed === true;
           const isEmptyLine = lineContent.trim() === '';
           const isCursorAtStart = cursor.ch === 0;
           
           // 综合判断是否需要额外计算新行高度
           const needExtraLineHeight = isEnterKeyPressed || (isEmptyLine && (isCursorAtStart || cursor.line > 0));
           
           // 使用辅助函数计算高度
           let contentToCalculate = content;
           
           // 如果需要考虑额外的新行高度
           if (needExtraLineHeight) {
             // 确保内容末尾有换行符和零宽空格，以正确计算高度
             if (!contentToCalculate.endsWith('\n')) {
               contentToCalculate += '\n';
             }
             contentToCalculate += '\u200B'; // 添加零宽空格确保换行被计算
           }
           
           const previewHeight = self.calculatePreviewHeight(
             contentToCalculate,
             simplemde.codemirror.getWrapperElement().offsetWidth
           );
           
           // 设置编辑器高度
           const codeMirror = simplemde.codemirror.getWrapperElement();
           codeMirror.style.height = `${previewHeight}px`;
           simplemde.codemirror.refresh();
         };
      
      // 监听内容变化，动态调整高度
      simplemde.codemirror.on('change', adjustHeight);
      
      // 初始调整高度
      setTimeout(adjustHeight, 100);
      
      // 设置失焦自动保存
      simplemde.codemirror.on('blur', () => {
        setTimeout(() => {
          const fieldEdit = fieldItem.find('.field-edit');
          if (fieldEdit.is(':visible')) {
            this.saveMarkdownField(fieldItem, simplemde);
          }
        }, 200);
      });
      
      // 设置键盘事件处理
      simplemde.codemirror.on('keydown', (cm: any, event: KeyboardEvent) => {
        // Esc键退出编辑
        if (event.key === 'Escape') {
          event.preventDefault();
          this.exitEditMode(fieldItem);
        }
        
        // Enter键立即刷新编辑器，确保新行立即显示
        if (event.key === 'Enter') {
          // 记录当前是Enter键事件，用于高度计算
          cm.enterKeyPressed = true;
          
          // 立即执行一次调整，处理键盘事件
          // 这里不调用adjustHeight，因为Enter键还没有实际插入换行符
          
          // 使用三次setTimeout以不同延迟确保DOM完全更新后再次调整
          // 第一次极短延迟执行，捕获Enter键刚插入换行符的状态
          setTimeout(() => {
            // 此时Enter键的换行符已插入但可能还没有渲染完成
            simplemde.codemirror.refresh();
            // 强制计算包含新行的高度
            const content = simplemde.value();
            const previewHeight = self.calculatePreviewHeight(
              content + '\n\u200B', // 确保计算高度时考虑额外的一行
              simplemde.codemirror.getWrapperElement().offsetWidth
            );
            
            // 设置编辑器高度
            const codeMirror = simplemde.codemirror.getWrapperElement();
            codeMirror.style.height = `${previewHeight}px`;
            simplemde.codemirror.refresh();
            
            // 确保光标可见
            const cursor = simplemde.codemirror.getCursor();
            simplemde.codemirror.scrollIntoView(cursor);
          }, 0);
          
          // 第二次短延迟执行，确保内容已完全渲染
          setTimeout(() => {
            simplemde.codemirror.refresh();
            adjustHeight();
            
            // 修复底部边距问题
            const scrollInfo = simplemde.codemirror.getScrollInfo();
            
            // 如果光标在最后一行附近，确保滚动到底部
            const cursor = simplemde.codemirror.getCursor();
            if (cursor.line >= simplemde.codemirror.lineCount() - 2) {
              // 计算应该滚动的位置
              const scrollBottom = scrollInfo.height - scrollInfo.clientHeight;
              if (scrollBottom > 0) {
                simplemde.codemirror.scrollTo(null, scrollBottom);
              }
            }
          }, 10);
          
          // 第三次较长延迟执行，确保所有DOM操作完成
          setTimeout(() => {
            cm.enterKeyPressed = false; // 重置标记
            simplemde.codemirror.refresh();
            adjustHeight();
          }, 50);
        }
      });
      
      // 聚焦编辑器，并阻止浏览器自动滚动
      const inputField = simplemde.codemirror.getInputField();
      if (inputField && typeof inputField.focus === 'function') {
        inputField.focus({ preventScroll: true });
      } else {
        // 使用preventScroll选项聚焦
        try {
          simplemde.codemirror.focus({ preventScroll: true });
        } catch (e) {
          // 如果不支持preventScroll选项，则使用普通聚焦
          simplemde.codemirror.focus();
        }
      }
      
      // 如果有点击位置，设置光标位置
      if (clickPosition !== undefined) {
        setTimeout(() => {
          this.setCursorPosition(simplemde.codemirror, clickPosition);
        }, 10);
      }
    }).catch(error => {
      console.error('Failed to load SimpleMDE:', error);
      // 降级到普通textarea
      textarea.focus();
    });
  });
}
  
  // 动态加载SimpleMDE
  // 恢复所有滚动位置
  private restoreScrollPositions(positions: any, parentElement?: JQuery<HTMLElement>): void {
    try {
      // 创建一个临时样式，防止滚动行为触发其他滚动事件
      const preventScrollStyle = document.createElement('style');
      preventScrollStyle.textContent = `
        html, body, * { scroll-behavior: auto !important; }
      `;
      document.head.appendChild(preventScrollStyle);
      
      // 恢复window滚动位置
      if (positions.window && typeof positions.window.scrollX === 'number' && typeof positions.window.scrollY === 'number') {
        window.scrollTo({
          left: positions.window.scrollX,
          top: positions.window.scrollY,
          behavior: 'auto' // 使用即时滚动，不使用平滑滚动
        });
      }
      
      // 恢复body滚动位置
      if (typeof positions.body === 'number') {
        $('body').scrollTop(positions.body);
      }
      
      // 恢复html滚动位置
      if (typeof positions.html === 'number') {
        $('html').scrollTop(positions.html);
      }
      
      // 恢复documentElement滚动位置
      if (typeof positions.documentElement === 'number') {
        document.documentElement.scrollTop = positions.documentElement;
      }
      
      // 恢复容器滚动位置
      if (typeof positions.container === 'number') {
        $('#fieldsContainer').scrollTop(positions.container);
      }
      
      // 恢复父元素滚动位置
      if (typeof positions.parent === 'number' && parentElement && parentElement.length > 0) {
        const parent = parentElement.parent();
        if (parent.length > 0) {
          parent.scrollTop(positions.parent);
        }
      }
      
      // 移除临时样式
      document.head.removeChild(preventScrollStyle);
    } catch (error) {
      console.error('Error restoring scroll positions:', error);
    }
  }
  
  private async loadSimpleMDE(): Promise<void> {
    if ((window as any).SimpleMDE) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      // 加载CSS
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://cdn.jsdelivr.net/simplemde/latest/simplemde.min.css';
      document.head.appendChild(cssLink);
      
      // 加载JS
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/simplemde/latest/simplemde.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load SimpleMDE'));
      document.head.appendChild(script);
    });
  }

  // 保存Markdown字段
  private async saveMarkdownField(fieldItem: JQuery<HTMLElement>, simplemde: any): Promise<void> {
    const fieldId = fieldItem.data('field-id');
    const fieldMeta = this.fieldMetaList.find(f => f.id === fieldId);
    
    if (!fieldMeta) {
      console.error('Field meta not found');
      return;
    }
    
    const newValue = simplemde.value();
    const recordId = this.currentRecordId;

    if (!recordId) {
      console.error(i18next.t('saveFailed'), 'No record selected');
      this.showMessage(i18next.t('saveFailed'), 'error');
      return;
    }

    try {
      // 更新字段值缓存
      this.currentFieldValues[fieldId] = newValue;
      
      // 调用API保存
      const table = await bitable.base.getTableById(this.currentTableId!);
      await table.setRecord(recordId, {
        fields: {
          [fieldId]: newValue
        }
      });
      
      // 更新显示
      const fieldValue = fieldItem.find('.field-value');
      const formattedValue = this.formatFieldValue(fieldMeta.type, newValue);
      const isEmpty = !newValue || newValue.trim() === '';
      
      fieldValue.html(isEmpty ? `<span class="empty-value">${i18next.t('noData')}</span>` : formattedValue);
      fieldItem.toggleClass('empty', isEmpty);
      
      // 更新复制按钮和预览按钮
      const copyBtn = fieldItem.find('.copy-btn');
      const previewBtn = fieldItem.find('.preview-btn');
      const fieldActions = fieldItem.find('.field-actions');
      
      if (isEmpty || !this.isTextTypeField(fieldMeta.type)) {
        copyBtn.hide();
        previewBtn.remove();
      } else {
        const rawValue = this.getRawTextValue(fieldMeta.type, newValue);
        const escapedValue = rawValue.replace(/"/g, '&quot;');
        const hasMarkdown = this.containsMarkdown(rawValue);
        
        copyBtn.show().attr('data-value', escapedValue);
        
        // 处理预览按钮
        if (hasMarkdown) {
          if (previewBtn.length > 0) {
            // 更新现有预览按钮的data-value属性
            previewBtn.attr('data-value', escapedValue);
          } else {
            // 创建新的预览按钮
            const previewBtnHtml = `<button class="preview-btn" title="预览Markdown" data-action="preview" data-value="${escapedValue}">
              <svg class="preview-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>`;
            fieldActions.prepend(previewBtnHtml);
          }
        } else {
          // 移除预览按钮（如果内容不再包含Markdown语法）
          previewBtn.remove();
        }
      }
      
      // 退出编辑模式
      this.exitEditMode(fieldItem);
      
      this.showMessage(i18next.t('saveSuccess'), 'success');
    } catch (error) {
      console.error('Save failed:', error);
      this.showMessage(i18next.t('saveFailed'), 'error');
    }
  }
  
  // 退出编辑模式
  private exitEditMode(fieldItem: JQuery<HTMLElement>): void {
    const fieldValue = fieldItem.find('.field-value');
    const fieldEdit = fieldItem.find('.field-edit');
    const textarea = fieldItem.find('.markdown-editor')[0] as HTMLTextAreaElement;
    
    // 销毁SimpleMDE实例
    if (textarea && (textarea as any).simplemde) {
      (textarea as any).simplemde.toTextArea();
      delete (textarea as any).simplemde;
      delete textarea.dataset.simplemdeInitialized;
    }
    
    fieldValue.show();
    fieldEdit.hide();
  }
  
  // 取消编辑
  private cancelEdit(fieldValue: JQuery<HTMLElement>, fieldEdit: JQuery<HTMLElement>, editInput: JQuery<HTMLElement>, fieldItem: JQuery<HTMLElement>): void {
    // 这个方法已被exitEditMode替代，保留是为了兼容性
    this.exitEditMode(fieldItem);
  }

  // 保存字段值
  private async saveFieldValue(fieldItem: JQuery<HTMLElement>, fieldMeta: any, editInput: JQuery<HTMLElement>, fieldValue: JQuery<HTMLElement>, fieldEdit: JQuery<HTMLElement>): Promise<void> {
    const newValue = editInput.text();
    const fieldId = fieldMeta.id;
    const recordId = this.currentRecordId;

    if (!recordId) {
      console.error(i18next.t('saveFailed'), 'No record selected');
      this.showMessage(i18next.t('saveFailed'), 'error');
      return;
    }

    try {
      // 显示保存状态
      const saveBtn = fieldEdit.find('.save-btn');
      const originalText = saveBtn.text();
      saveBtn.prop('disabled', true).text('...');

      // 调用飞书API更新字段值
      await this.updateFieldValue(recordId, fieldId, newValue, fieldMeta.type);
      
      // 更新缓存中的字段值
      this.currentFieldValues[fieldId] = newValue;
      
      // 更新显示的值
      const formattedValue = this.formatFieldValue(fieldMeta.type, newValue);
      fieldValue.html(newValue ? formattedValue : `<span class="empty-value">${i18next.t('noData')}</span>`);
      
      // 更新字段项的empty状态
      const isEmpty = !newValue;
      fieldItem.toggleClass('empty', isEmpty);
      
      // 退出编辑模式
      fieldValue.show();
      fieldEdit.hide();
      
      // 显示成功消息
      this.showMessage(i18next.t('saveSuccess'), 'success');
      
      // 恢复按钮状态
      saveBtn.prop('disabled', false).text(originalText);
      
    } catch (error) {
      console.error(i18next.t('saveFailed'), error);
      this.showMessage(i18next.t('saveFailed'), 'error');
      
      // 恢复按钮状态
      const saveBtn = fieldEdit.find('.save-btn');
      saveBtn.prop('disabled', false).text(i18next.t('saveContent'));
    }
  }

  // 更新字段值的API调用
  private async updateFieldValue(recordId: string, fieldId: string, value: string, fieldType: FieldType): Promise<void> {
    // 根据字段类型转换值
    let convertedValue: any = value;
    
    switch (fieldType) {
      case FieldType.Number:
        convertedValue = value ? parseFloat(value) : null;
        if (isNaN(convertedValue)) {
          throw new Error('Invalid number format');
        }
        break;
      case FieldType.Text:
      case FieldType.Phone:
      default:
        convertedValue = value;
        break;
    }

    // 调用飞书API
    await bitable.base.getActiveTable().then(table => 
      table.setRecord(recordId, {
        fields: {
          [fieldId]: convertedValue
        }
      })
    );
  }

  // 获取当前字段值
  private getCurrentFieldValue(fieldId: string): string {
    // 优先从缓存中获取最新保存的值
    if (this.currentFieldValues[fieldId] !== undefined) {
      const value = this.currentFieldValues[fieldId];
      return value === null || value === undefined ? '' : String(value);
    }
    
    // 如果缓存中没有，从DOM中获取当前显示的值
    try {
      const fieldItem = $(`.field-item[data-field-id="${fieldId}"]`);
      if (fieldItem.length > 0) {
        const editInput = fieldItem.find('.edit-input');
        if (editInput.length > 0) {
          const currentText = editInput.text();
          return currentText || '';
        }
      }
    } catch (error) {
      console.error('Error getting current field value:', error);
    }
    
    return '';
  }

  // 设置光标到末尾
  private setCursorToEnd(element: HTMLElement): void {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  // 显示消息提示
  private showMessage(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // 如果是保存成功的消息，不显示提示
    if (type === 'success' && message === i18next.t('saveSuccess')) {
      return;
    }
    
    // 移除现有的消息
    $('.message-toast').remove();
    
    // 创建新的消息提示
    const toast = $(`
      <div class="message-toast message-${type}">
        <span class="message-text">${message}</span>
      </div>
    `);
    
    // 添加到页面
    $('body').append(toast);
    
    // 显示动画
    setTimeout(() => toast.addClass('show'), 10);
    
    // 自动隐藏 - 极短显示时间
    setTimeout(() => {
      toast.removeClass('show');
      setTimeout(() => toast.remove(), 200);
    }, 500);
  }

  private copyToClipboard(text: string, button: JQuery<HTMLElement>): void {
    // 尝试使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        this.showCopySuccess(button);
      }).catch((err) => {
        console.error('Clipboard API', i18next.t('copyFailed'), ':', err);
        // 如果 Clipboard API 失败，尝试使用传统方法
        this.fallbackCopyToClipboard(text, button);
      });
    } else {
      // 在非安全上下文中使用传统方法
      this.fallbackCopyToClipboard(text, button);
    }
  }

  private fallbackCopyToClipboard(text: string, button: JQuery<HTMLElement>): void {
    try {
      // 创建一个临时文本区域元素
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // 设置样式使其不可见
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      // 选择文本并复制
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (success) {
        this.showCopySuccess(button);
      } else {
        console.error('execCommand', i18next.t('copyFailed'));
      }
    } catch (err) {
      console.error(i18next.t('copyFailed'), ':', err);
    }
  }

  private showCopySuccess(button: JQuery<HTMLElement>): void {
    // 可以在这里添加其他成功提示，比如显示toast消息
    console.log(i18next.t('copySuccess'));
  }

  private formatRichText(richTextArray: any[]): string {
    if (!Array.isArray(richTextArray)) {
      return this.escapeHtml(String(richTextArray));
    }

    return richTextArray.map(segment => {
      if (typeof segment === 'object' && segment.text !== undefined) {
        let text = segment.text;
        let html = this.escapeHtml(text);
        
        // 处理换行符
        html = html.replace(/\n/g, '<br>');
        
        // 处理格式化样式
        if (segment.style) {
          if (segment.style.bold) {
            html = `<strong>${html}</strong>`;
          }
          if (segment.style.italic) {
            html = `<em>${html}</em>`;
          }
          if (segment.style.underline) {
            html = `<u>${html}</u>`;
          }
          if (segment.style.strikethrough) {
            html = `<s>${html}</s>`;
          }
          if (segment.style.color) {
            html = `<span style="color: ${segment.style.color}">${html}</span>`;
          }
        }
        
        return html;
      } else if (typeof segment === 'string') {
        return this.escapeHtml(segment).replace(/\n/g, '<br>');
      } else {
        return this.escapeHtml(String(segment));
      }
    }).join('');
  }

  private formatLookupField(lookupArray: any[]): string {
    if (!Array.isArray(lookupArray)) {
      return this.escapeHtml(String(lookupArray));
    }

    // 提取所有文本内容
    const textContents: string[] = [];
    
    for (const item of lookupArray) {
      if (typeof item === 'object' && item.type === 'text' && item.text) {
        // 跳过逗号分隔符
        if (item.text.trim() === ',') {
          continue;
        }
        textContents.push(item.text.trim());
      } else if (typeof item === 'string') {
        // 跳过逗号分隔符
        if (item.trim() === ',') {
          continue;
        }
        textContents.push(item.trim());
      }
    }

    // 每行显示一个内容
    return textContents.map(text => 
      `<div class="lookup-item">${this.escapeHtml(text)}</div>`
    ).join('');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 计算双击位置对应的文本位置
  private calculateTextPosition(element: HTMLElement, event: MouseEvent): number {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range) return 0;
    
    // 获取元素的文本内容
    const textContent = element.textContent || '';
    
    // 如果点击在元素内部
    if (element.contains(range.startContainer)) {
      let position = 0;
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let node;
      while (node = walker.nextNode()) {
        if (node === range.startContainer) {
          position += range.startOffset;
          break;
        } else {
          position += node.textContent?.length || 0;
        }
      }
      
      return Math.min(position, textContent.length);
    }
    
    return 0;
  }

  // 设置CodeMirror光标位置
  private setCursorPosition(codemirror: any, position: number, scrollPositions?: any): void {
    const content = codemirror.getValue();
    if (position > content.length) {
      position = content.length;
    }
    // 将字符位置转换为行列位置
    let line = 0;
    let ch = 0;
    let currentPos = 0;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length;
      if (currentPos + lineLength >= position) {
        line = i;
        ch = position - currentPos;
        break;
      }
      currentPos += lineLength + 1; // +1 for the newline character
    }
    
    // 禁用编辑器的滚动行为
    const originalScrollIntoView = codemirror.scrollIntoView;
    codemirror.scrollIntoView = () => {}; // 临时禁用自动滚动
    
    // 设置光标位置
    codemirror.setCursor({ line, ch });
    
    // 恢复原始的scrollIntoView方法
    setTimeout(() => {
      codemirror.scrollIntoView = originalScrollIntoView;
    }, 100);
    
    // 不在这里聚焦，避免重复聚焦导致滚动问题
  }

  private async init() {
    try {
      // 防止重复初始化
      if (this.isInitialized) {
        return;
      }
      
      // 清理旧的监听器
      this.cleanup();
      
      // 添加键盘事件监听器
      $(document).on('keydown.tableNavigation', (e) => {
        // 只有在有选中记录时才响应键盘事件
        if (!this.currentTableId || !this.currentRecordId) {
          return;
        }
        
        // 检查是否在编辑模式下，如果是则不响应导航键
        if ($('.field-edit:visible').length > 0) {
          return;
        }
        
        // 检查是否有模态框打开，如果有则不响应导航键
        if ($('.modal:visible').length > 0) {
          return;
        }
        
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            this.navigateToPreviousRow();
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.navigateToNextRow();
            break;
        }
      });
      
      // 使用事件委托处理图片点击事件
      $('#fieldsContainer').on('click', '.attachment-image', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const imgSrc = $(e.target).attr('src') || '';
        const imgAlt = $(e.target).attr('alt') || '';
        if (imgSrc) {
          this.showImageModal(imgSrc, imgAlt);
        }
      });
      
      // 使用事件委托处理点击事件
      $('#fieldsContainer').on('click', '[data-action]', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const target = $(e.currentTarget);
        const action = target.data('action');
        const fieldItem = target.closest('.field-item');
        const fieldId = fieldItem.data('field-id');
        
        // 根据不同的操作执行相应的处理
        switch (action) {
          case 'copy':
            const value = target.data('value');
            this.copyToClipboard(value, target);
            break;
          case 'preview':
            // 检查是否在编辑模式下
            const fieldEdit = fieldItem.find('.field-edit');
            let markdownText;
            
            if (fieldEdit.is(':visible')) {
              // 如果在编辑模式下，从编辑器获取最新内容
              const textarea = fieldItem.find('.markdown-editor')[0] as HTMLTextAreaElement;
              if (textarea && (textarea as any).simplemde) {
                markdownText = (textarea as any).simplemde.value();
              } else {
                // 如果编辑器未初始化，从缓存获取最新值
                markdownText = this.currentFieldValues[fieldId] || '';
              }
            } else {
              // 如果不在编辑模式下，从缓存获取最新值
              markdownText = this.currentFieldValues[fieldId] || '';
            }
            
            this.showMarkdownPreview(markdownText, fieldId);
            break;
        }
      });
      
      // 使用事件委托处理双击事件 - 进入编辑模式
    $('#fieldsContainer').on('dblclick', '.field-value.editable', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const fieldValue = $(e.currentTarget);
        const fieldItem = fieldValue.closest('.field-item');
        const fieldEdit = fieldItem.find('.field-edit');
        const markdownEditor = fieldItem.find('.markdown-editor');
        
        // 计算双击位置对应的文本位置
        const clickPosition = this.calculateTextPosition(fieldValue[0], e.originalEvent as MouseEvent);
        
        await this.enterEditMode(fieldValue, fieldEdit, markdownEditor, fieldItem, clickPosition);
      });
      
      // Markdown编辑器的事件处理已移至initMarkdownEditor方法中
      
      // 创建新的监听器
      this.selectionChangeHandler = async (event) => {
        if (event.data?.tableId && event.data?.recordId) {
          const newTableId = event.data.tableId;
          const newRecordId = event.data.recordId;
          try {
            await this.loadRowData(newTableId, newRecordId);
            // 只有在成功加载数据后才更新当前状态
            this.currentTableId = newTableId;
            this.currentRecordId = newRecordId;
          } catch (error) {
            console.error('Selection change failed:', error);
            // 加载失败时保持原有状态，错误信息已在loadRowData中处理
          }
        } else {
          // 失焦时不清空预览内容，保持最后预览的状态
          // 只有在没有任何预览内容时才显示无选择状态
          if (!this.currentTableId || !this.currentRecordId) {
            this.showNoSelection();
          }
          // 注意：不清空 currentTableId 和 currentRecordId，保持最后的状态
        }
      };
      
      // 监听选择变化
      bitable.base.onSelectionChange(this.selectionChangeHandler);

      // 刷新按钮已删除，不需要事件绑定

      // 初始状态
      this.showNoSelection();
      
      // 标记为已初始化
      this.isInitialized = true;
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('初始化失败，请刷新页面重试');
    }
  }

  private async handleSelectionChange(event: any) {
    try {
      const { tableId, recordId } = event.data;
      
      if (!tableId || !recordId) {
        // 失焦时不清空预览内容，保持最后预览的状态
        // 只有在没有任何预览内容时才显示无选择状态
        if (!this.currentTableId || !this.currentRecordId) {
          this.showNoSelection();
        }
        // 注意：不清空 currentTableId 和 currentRecordId，保持最后的状态
        return;
      }

      if (tableId === this.currentTableId && recordId === this.currentRecordId) {
        return; // 相同的选择，不需要重新加载
      }

      // 更新当前记录ID
      const needReloadMetadata = tableId !== this.currentTableId;
      this.currentTableId = tableId;
      this.currentRecordId = recordId;
      
      // 加载数据
      await this.loadRowData(tableId, recordId);
    } catch (error) {
      console.error(i18next.t('selectionChangeFailed'), error);
      this.showError(i18next.t('getDataFailed'));
    }
  }

  private async loadRowData(tableId: string, recordId: string) {
    // 清空字段值缓存，确保获取最新数据
    this.currentFieldValues = {};
    
    try {
      // 获取表格
      const table = await bitable.base.getTableById(tableId);
      
      // 优先获取记录数据，这是最重要的
      const record = await table.getRecordById(recordId);
      
      // 如果已经有字段元数据，则不需要重新获取
      if (!this.fieldMetaList.length || this.currentTableId !== tableId) {
        // 并行获取其他元数据
        const [tableMeta, fieldMetaList, viewMetaList] = await Promise.all([
          table.getMeta(),
          table.getFieldMetaList(),
          table.getViewMetaList()
        ]);
        
        // 获取当前视图（默认使用第一个视图）
        const currentView = await table.getViewById(viewMetaList[0].id);
        
        // 获取视图中可见字段的ID列表（按照视图中的顺序排列）
        const visibleFieldIds = await currentView.getVisibleFieldIdList();
        
        // 根据视图中的字段顺序对fieldMetaList进行排序
        const fieldMap = new Map(fieldMetaList.map(field => [field.id, field]));
        this.fieldMetaList = visibleFieldIds
          .filter(id => fieldMap.has(id))
          .map(id => fieldMap.get(id)!);
        
        this.tableName = tableMeta.name;
        
        // 获取当前视图的记录ID列表（用于导航）
         try {
           const recordIdList = await currentView.getVisibleRecordIdList();
           this.recordIdList = recordIdList.filter((id): id is string => id !== undefined);
         } catch (error) {
           console.warn('Failed to get record list for navigation:', error);
           this.recordIdList = [];
         }
      }
      
      // 更新当前记录在列表中的索引
       this.currentRecordIndex = this.recordIdList.indexOf(recordId);
       if (this.currentRecordIndex === -1 && this.recordIdList.length === 0) {
         // 如果记录列表为空，尝试重新获取
         try {
           const currentView = await table.getViewById((await table.getViewMetaList())[0].id);
           const recordIdList = await currentView.getVisibleRecordIdList();
           this.recordIdList = recordIdList.filter((id): id is string => id !== undefined);
           this.currentRecordIndex = this.recordIdList.indexOf(recordId);
         } catch (error) {
           console.warn('Failed to refresh record list:', error);
         }
       }

      // 获取记录数据
      const fields = record.fields;
      
      // 获取行索引（使用优化后的方法）
      const rowIndex = await this.getRowIndex(table, recordId);
      
      // 立即渲染内容
      this.renderRowContent({
        recordId,
        fields
      }, rowIndex);
      
      // 如果有上次预览的字段ID，并且预览框已经打开，才自动预览新行中相同字段的内容
      if (this.lastPreviewedFieldId && fields[this.lastPreviewedFieldId] && $('.markdown-preview-modal').length > 0) {
        const fieldValue = this.getRawTextValue(this.fieldMetaList.find(f => f.id === this.lastPreviewedFieldId)?.type, fields[this.lastPreviewedFieldId]);
        // 无论是否包含Markdown语法，都显示预览
        if (fieldValue) {
          // 使用setTimeout确保DOM已经完全渲染
          setTimeout(() => {
            // 确保lastPreviewedFieldId不为null
            if (this.lastPreviewedFieldId) {
              this.showMarkdownPreview(fieldValue, this.lastPreviewedFieldId);
            } else {
              this.showMarkdownPreview(fieldValue);
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error(i18next.t('loadRowDataFailed'), error);
      this.showError(i18next.t('loadFailedPermission'));
    }
  }

  private async getRowIndex(table: any, recordId: string): Promise<number> {
    // 为了提高性能，不再获取所有记录ID
    // 直接返回默认值1，避免在大型表格中造成性能问题
    return 1;
    
    /* 原始实现（性能较慢，特别是在大型表格中）
    try {
      // 获取所有记录ID来确定索引
      const recordIdList = await table.getRecordIdList();
      const index = recordIdList.findIndex((id: string) => id === recordId);
      return index >= 0 ? index + 1 : 1;
    } catch {
      return 1; // 如果获取失败，返回默认值
    }
    */
  }

  private renderRowContent(rowData: RowData, rowIndex: number) {
    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();
    const container = $('#fieldsContainer');
    
    // 只有在必要时才清空容器
    container.empty();
  
    // 按照fieldMetaList的顺序渲染字段
    this.fieldMetaList.forEach((field, index) => {
      const value = rowData.fields[field.id];
      const fieldItem = this.createFieldItem(field, value, index);
      fragment.appendChild(fieldItem[0]);
    });
    
    // 一次性添加所有元素
    container.append(fragment);
    
    // 显示内容区域
    this.showRowContent();
  }

  private createFieldItem(fieldMeta: any, value: any, index: number): JQuery<HTMLElement> {
    // 使用缓存减少重复计算
    const formattedValue = this.formatFieldValue(fieldMeta.type, value);
    const isEmpty = value === null || value === undefined || value === '';
    const rawValue = this.getRawTextValue(fieldMeta.type, value);
    const isTextType = this.isEditableTextType(fieldMeta.type);
    
    // 初始化字段值缓存
    this.currentFieldValues[fieldMeta.id] = rawValue;
    
    // 检测是否包含Markdown语法（仅对文本类型字段进行检测）
    const hasMarkdown = isTextType && !isEmpty && this.containsMarkdown(rawValue);
    
    // 使用模板字符串一次性创建DOM结构，减少DOM操作
    const fieldItem = $(`
      <div class="field-item ${isEmpty ? 'empty' : ''}" style="--index: ${index}" data-field-id="${fieldMeta.id}" data-field-type="${fieldMeta.type}">
        <div class="field-header">
          <span class="field-name">${fieldMeta.name}</span>
          <div class="field-actions">
            ${hasMarkdown ? `<button class="preview-btn" title="预览Markdown" data-action="preview" data-value="${rawValue.replace(/"/g, '&quot;')}">
              <svg class="preview-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>` : ''}
            ${!isEmpty && this.isTextTypeField(fieldMeta.type) ? `<button class="copy-btn" title="${i18next.t('copyContent')}" data-action="copy" data-value="${rawValue.replace(/"/g, '&quot;')}">
              <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H16C17.1046 21 18 20.1046 18 19V18M8 5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5V7C16 8.10457 15.1046 9 14 9H10C8.89543 9 8 8.10457 8 7V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>` : ''}
          </div>
        </div>
        <div class="field-value-container">
          <div class="field-value ${isTextType ? 'editable' : ''}" ${isTextType ? 'title="双击编辑"' : ''}>${isEmpty ? `<span class="empty-value">${i18next.t('noData')}</span>` : formattedValue}</div>
          ${isTextType ? `<div class="field-edit" style="display: none;">
            <textarea class="markdown-editor" data-field-id="${fieldMeta.id}">${this.escapeHtml(rawValue)}</textarea>
          </div>` : ''}
        </div>
      </div>
    `);
    
    // 使用事件委托，减少事件监听器数量
     // 事件绑定移到了init方法中，使用事件委托处理所有字段的事件
     
     return fieldItem;
  }









  // refreshCurrentRow方法已删除，因为刷新按钮已移除
  
  /**
   * 导航到上一行记录
   */
  private async navigateToPreviousRow(): Promise<void> {
    if (!this.currentTableId || this.recordIdList.length === 0 || this.currentRecordIndex <= 0) {
      return;
    }
    
    const previousRecordId = this.recordIdList[this.currentRecordIndex - 1];
    if (previousRecordId) {
      try {
        // 直接加载数据并更新当前记录
        await this.loadRowData(this.currentTableId, previousRecordId);
        this.currentRecordId = previousRecordId;
        this.currentRecordIndex = this.currentRecordIndex - 1;
      } catch (error) {
        console.error('Failed to navigate to previous row:', error);
      }
    }
  }
 
 /**
   * 导航到下一行记录
   */
  private async navigateToNextRow(): Promise<void> {
    if (!this.currentTableId || this.recordIdList.length === 0 || this.currentRecordIndex >= this.recordIdList.length - 1) {
      return;
    }
    
    const nextRecordId = this.recordIdList[this.currentRecordIndex + 1];
    if (nextRecordId) {
      try {
        // 直接加载数据并更新当前记录
        await this.loadRowData(this.currentTableId, nextRecordId);
        this.currentRecordId = nextRecordId;
        this.currentRecordIndex = this.currentRecordIndex + 1;
      } catch (error) {
        console.error('Failed to navigate to next row:', error);
      }
    }
  }
}

// 初始化应用
$(document).ready(() => {
  TableRowPreview.getInstance();
});