document.addEventListener('DOMContentLoaded', function() {
  const traceIdInput = document.getElementById('traceId');
  const beforeTimeInput = document.getElementById('beforeTime');
  const afterTimeInput = document.getElementById('afterTime');
  const generateButton = document.getElementById('generateUrl');
  const statusDiv = document.getElementById('status');

  // 从存储中恢复之前的值
  chrome.storage.sync.get(['traceId', 'beforeTime', 'afterTime'], function(result) {
    if (result.traceId) traceIdInput.value = result.traceId;
    if (result.beforeTime) beforeTimeInput.value = result.beforeTime;
    if (result.afterTime) afterTimeInput.value = result.afterTime;
  });

  // 保存输入值到存储
  function saveInputs() {
    chrome.storage.sync.set({
      traceId: traceIdInput.value,
      beforeTime: beforeTimeInput.value,
      afterTime: afterTimeInput.value
    });
  }

  traceIdInput.addEventListener('input', saveInputs);
  beforeTimeInput.addEventListener('input', saveInputs);
  afterTimeInput.addEventListener('input', saveInputs);

  // 从Trace ID中提取时间戳
  function extractTimestamp(traceId) {
    // Trace ID格式: 20251026124314408ea0347e014e5d
    // 时间戳部分: 20251026124314 (前14位)
    const timestampStr = traceId.substring(0, 14);

    if (timestampStr.length !== 14 || !/^\d{14}$/.test(timestampStr)) {
      return null;
    }

    // 解析时间戳: 2025-10-26 12:43:14
    const year = parseInt(timestampStr.substring(0, 4));
    const month = parseInt(timestampStr.substring(4, 6)) - 1; // 月份从0开始
    const day = parseInt(timestampStr.substring(6, 8));
    const hour = parseInt(timestampStr.substring(8, 10));
    const minute = parseInt(timestampStr.substring(10, 12));
    const second = parseInt(timestampStr.substring(12, 14));

    const date = new Date(year, month, day, hour, minute, second);

    // 验证日期是否有效
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  // 生成Grafana URL
  function generateGrafanaUrl(timestamp, beforeMinutes, afterMinutes) {
    const fromTime = new Date(timestamp.getTime() - beforeMinutes * 60 * 1000);
    const toTime = new Date(timestamp.getTime() + afterMinutes * 60 * 1000);

    // 转换为Unix时间戳（毫秒）
    const fromTimestamp = fromTime.getTime();
    const toTimestamp = toTime.getTime();

    // Grafana URL模板
    const baseUrl = 'https://grafana-monitor.chatglm.cn/explore';

    // 构建查询参数
    const panes = {
      "xnh": {
        "datasource": "adpq720zt80zke",
        "queries": [
          {
            "refId": "A",
            "expr": "",
            "queryType": "range",
            "datasource": {
              "type": "loki",
              "uid": "adpq720zt80zke"
            }
          }
        ],
        "range": {
          "from": fromTimestamp.toString(),
          "to": toTimestamp.toString()
        }
      }
    };

    // URL编码panes参数
    const encodedPanes = encodeURIComponent(JSON.stringify(panes));

    return `${baseUrl}?schemaVersion=1&panes=${encodedPanes}&orgId=1`;
  }

  // 显示状态消息
  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${isError ? 'error' : 'success'}`;
    statusDiv.style.display = 'block';

    // 3秒后隐藏状态消息
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // 格式化时间显示
  function formatTime(date) {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  // 生成URL并跳转
  generateButton.addEventListener('click', function() {
    const traceId = traceIdInput.value.trim();
    const beforeMinutes = parseInt(beforeTimeInput.value) || 5;
    const afterMinutes = parseInt(afterTimeInput.value) || 5;

    // 验证输入
    if (!traceId) {
      showStatus('请输入 Trace ID', true);
      return;
    }

    if (traceId.length < 14) {
      showStatus('Trace ID 长度不足，无法提取时间戳', true);
      return;
    }

    // 提取时间戳
    const timestamp = extractTimestamp(traceId);
    if (!timestamp) {
      showStatus('无法从 Trace ID 中提取有效的时间戳', true);
      return;
    }

    try {
      // 生成Grafana URL
      const grafanaUrl = generateGrafanaUrl(timestamp, beforeMinutes, afterMinutes);

      // 显示成功消息
      const timeStr = formatTime(timestamp);
      showStatus(`时间: ${timeStr}，正在跳转到 Grafana...`, false);

      // 在新标签页中打开URL
      chrome.tabs.create({ url: grafanaUrl });

    } catch (error) {
      console.error('生成URL时出错:', error);
      showStatus('生成URL时出错，请检查控制台', true);
    }
  });

  // 回车键触发生成
  traceIdInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      generateButton.click();
    }
  });
});