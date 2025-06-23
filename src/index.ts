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
  private currentTableId: string | null = null;
  private currentRecordId: string | null = null;
  private fieldMetaList: FieldMeta[] = [];
  private tableName: string = '';

  constructor() {
    this.init();
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
          return value.map(item => {
            if (typeof item === 'object' && item.text) {
              return `<span class="option-item">${this.escapeHtml(item.text)}</span>`;
            } else if (typeof item === 'object') {
              return `<span class="option-item">${this.escapeHtml(JSON.stringify(item))}</span>`;
            }
            return `<span class="option-item">${this.escapeHtml(String(item))}</span>`;
          }).join(' ');
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
        return value ? new Date(value).toLocaleString('zh-CN') : '';
      
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
              return `<span class="attachment-item">📎 ${this.escapeHtml(attachment.name)}</span>`;
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
      
      case FieldType.Formula:
      case FieldType.Lookup:
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
        return value ? new Date(value).toLocaleString('zh-CN') : '';
      
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

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async init() {
    try {
      // 监听选择变化
      bitable.base.onSelectionChange(async (event) => {
        if (event.data?.tableId && event.data?.recordId) {
          this.currentTableId = event.data.tableId;
          this.currentRecordId = event.data.recordId;
          this.showLoading();
          await this.loadRowData(event.data.tableId, event.data.recordId);
        } else {
          this.currentTableId = null;
          this.currentRecordId = null;
          this.showNoSelection();
        }
      });

      // 刷新按钮已删除，不需要事件绑定

      // 初始状态
      this.showNoSelection();
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('初始化失败，请刷新页面重试');
    }
  }

  private async handleSelectionChange(event: any) {
    try {
      const { tableId, recordId } = event.data;
      
      if (!tableId || !recordId) {
        this.showNoSelection();
        return;
      }

      if (tableId === this.currentTableId && recordId === this.currentRecordId) {
        return; // 相同的选择，不需要重新加载
      }

      await this.loadRowData(tableId, recordId);
    } catch (error) {
      console.error(i18next.t('selectionChangeFailed'), error);
      this.showError(i18next.t('getDataFailed'));
    }
  }

  private async loadRowData(tableId: string, recordId: string) {
    this.showLoading();
    
    try {
      // 获取表格和字段信息
      const table = await bitable.base.getTableById(tableId);
      const [tableMeta, fieldMetaList, record, viewMetaList] = await Promise.all([
        table.getMeta(),
        table.getFieldMetaList(),
        table.getRecordById(recordId),
        table.getViewMetaList()
      ]);

      this.currentTableId = tableId;
      this.currentRecordId = recordId;
      
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

      // 获取记录数据
      const fields = record.fields;
      
      // 获取行索引（近似）
      const rowIndex = await this.getRowIndex(table, recordId);
      
      this.renderRowContent({
        recordId,
        fields
      }, rowIndex);
    } catch (error) {
      console.error(i18next.t('loadRowDataFailed'), error);
      this.showError(i18next.t('loadFailedPermission'));
    }
  }

  private async getRowIndex(table: any, recordId: string): Promise<number> {
    try {
      // 获取所有记录ID来确定索引
      const recordIdList = await table.getRecordIdList();
      const index = recordIdList.findIndex((id: string) => id === recordId);
      return index >= 0 ? index + 1 : 1;
    } catch {
      return 1; // 如果获取失败，返回默认值
    }
  }

  private renderRowContent(rowData: RowData, rowIndex: number) {
    // 清空容器
    const container = $('#fieldsContainer');
    container.empty();
  
    // 按照fieldMetaList的顺序渲染字段
    this.fieldMetaList.forEach((field, index) => {
      const value = rowData.fields[field.id];
      const fieldItem = this.createFieldItem(field, value, index);
      container.append(fieldItem);
    });
    
    // 显示内容区域
    this.showRowContent();
  }

  private createFieldItem(fieldMeta: any, value: any, index: number): JQuery<HTMLElement> {
    const formattedValue = this.formatFieldValue(fieldMeta.type, value);
    const isEmpty = value === null || value === undefined || value === '';
    const rawValue = this.getRawTextValue(fieldMeta.type, value);
    
    // 简化UI层级，减少嵌套的div元素
    const fieldItem = $(`
      <div class="field-item ${isEmpty ? 'empty' : ''}" style="--index: ${index}">
        <div class="field-header">
          <span class="field-name">${fieldMeta.name}</span>
          ${!isEmpty ? `<button class="copy-btn" title="${i18next.t('copyContent')}">
            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H16C17.1046 21 18 20.1046 18 19V18M8 5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5V7C16 8.10457 15.1046 9 14 9H10C8.89543 9 8 8.10457 8 7V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>` : ''}
        </div>
        <div class="field-value">${isEmpty ? `<span class="empty-value">${i18next.t('noData')}</span>` : formattedValue}</div>
      </div>
    `);
    
    // 添加复制功能
    if (!isEmpty) {
      fieldItem.find('.copy-btn').on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.copyToClipboard(rawValue, $(e.currentTarget));
      });
    }
    
    return fieldItem;
  }









  // refreshCurrentRow方法已删除，因为刷新按钮已移除
}

// 初始化应用
$(document).ready(() => {
  new TableRowPreview();
});