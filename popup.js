document.addEventListener('DOMContentLoaded', () => {
    const traceIdInput = document.getElementById('traceId');
    const timeRangeInput = document.getElementById('timeRange');
    const jumpButton = document.getElementById('jumpButton');
    const statusDiv = document.getElementById('status');
    const releaseNameInput = document.getElementById('releaseName');
    const suffixMatchCheckbox = document.getElementById('suffixMatch');
    const serverEntryCheckbox = document.getElementById('serverEntry');

    // 设置可展开板块
    setupCollapsible();

    jumpButton.addEventListener('click', async () => {
        console.log('跳转按钮点击');
        statusDiv.textContent = ''; // 清空状态信息
        const traceId = traceIdInput.value.trim();
        const timeRange = timeRangeInput.value.trim();

        // 1. 解析 TraceID 获取中心时间戳
        const centerTimestamp = parseTraceIdToTimestamp(traceId);
        if (!centerTimestamp) {
            console.log('错误');
            statusDiv.textContent = 'Error: Invalid TraceID format. Must start with YYYYMMDDHHMMSS.';
            return;
        }

        // 2. 解析时间范围获取毫秒数
        const rangeMilliseconds = parseTimeRangeToMilliseconds(timeRange);
        if (!rangeMilliseconds) {
            statusDiv.textContent = 'Error: Invalid time range format. Use s, m, h (e.g., 30s, 5m, 1h).';
            return;
        }

        // 3. 计算 from 和 to 时间戳
        const fromTimestamp = centerTimestamp - rangeMilliseconds;
        const toTimestamp = centerTimestamp + rangeMilliseconds;

        // 4. 获取当前 Tab 并修改 URL
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !tab.url.startsWith('https://grafana-monitor.chatglm.cn/explore')) {
            statusDiv.textContent = 'Error: Not on a valid Grafana explore page.';
            return;
        }

        try {
            let newUrl = setRange(tab.url, fromTimestamp, toTimestamp);

            // 检查 Release 板块是否展开且是否填写了内容
            const coll = document.querySelector('.collapsible');
            if (coll.classList.contains('active') && releaseNameInput.value.trim()) {
                newUrl = updateQuery(newUrl, releaseNameInput.value.trim(),
                                            suffixMatchCheckbox.checked, serverEntryCheckbox.checked);
            }

            // 5. 更新 Tab
            console.log("新的URL:", newUrl);
            await chrome.tabs.update(tab.id, { url: newUrl });
            window.close(); // 操作成功后关闭 popup
        } catch (error) {
            statusDiv.textContent = `Error: Failed to parse Grafana URL. ${error.message}`;
            console.error(error);
        }
    });
});

// 设置可展开板块
function setupCollapsible() {
    const coll = document.querySelector('.collapsible');
    const content = document.querySelector('.content');

    coll.addEventListener('click', function() {
        this.classList.toggle('active');
        content.classList.toggle('show');
    });
}

// 更新 Release 配置
function updateQuery(currentUrl, releaseName, suffixMatch, serverEntry) {
    const url = new URL(currentUrl);
    const params = url.searchParams;
    const panesParam = params.get('panes');

    if (!panesParam) {
        throw new Error('"panes" parameter not found in URL.');
    }

    const panesJson = decodeURIComponent(panesParam);
    const panesObj = JSON.parse(panesJson);

    const firstPaneKey = Object.keys(panesObj)[0];
    if (!firstPaneKey || !panesObj[firstPaneKey]) {
        throw new Error('Could not find a valid pane in URL.');
    }

    // 构建表达式
    let expr = `${releaseName} AND (`;
    let conditions = [];

    conditions.push(`app:="${releaseName}-lb"`);

    if (suffixMatch) {
        conditions.push(`app:~"${releaseName}-.*"`);
    }

    if (serverEntry) {
        conditions.push(`app:="model-gateway"`);
        conditions.push(`app:="traefik"`);
    }


    expr += conditions.join(' OR ') + ')';

    // 更新 expr 字段
    if (!panesObj[firstPaneKey].queries.expr) {
        panesObj[firstPaneKey].queries.expr = '';
    }
    panesObj[firstPaneKey].queries.expr = expr;

    const newPanesJson = JSON.stringify(panesObj);
    params.set('panes', newPanesJson);

    url.search = params.toString();
    return url.href;
}

function parseTraceIdToTimestamp(traceId) {
    if (!traceId || traceId.length < 14) {
        return null;
    }
    const dateTimeString = traceId.substring(0, 14); // "YYYYMMDDHHMMSS"
    const year = dateTimeString.substring(0, 4);
    const month = dateTimeString.substring(4, 6);
    const day = dateTimeString.substring(6, 8);
    const hour = dateTimeString.substring(8, 10);
    const minute = dateTimeString.substring(10, 12);
    const second = dateTimeString.substring(12, 14);

    // 构建 ISO 格式字符串以避免时区问题: YYYY-MM-DDTHH:MM:SS
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const date = new Date(isoString);

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
        return null;
    }
    return date.getTime();
}

/**
 * 将时间范围字符串解析为毫秒
 * @param {string} rangeStr - e.g., "5m", "30s", "1h"
 * @returns {number|null}
 */
function parseTimeRangeToMilliseconds(rangeStr) {
    const match = rangeStr.match(/^(\d+)([smh])$/);
    if (!match) {
        return null;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: return null;
    }
}


/**
 * 根据旧 URL 和新的时间戳创建新 URL
 * @param {string} currentUrl
 * @param {number} fromTimestamp
 * @param {number} toTimestamp
 * @returns {string}
 */
function setRange(currentUrl, fromTimestamp, toTimestamp) {
    const url = new URL(currentUrl);
    const params = url.searchParams;
    const panesParam = params.get('panes');

    if (!panesParam) {
        throw new Error('"panes" parameter not found in URL.');
    }

    const panesJson = decodeURIComponent(panesParam);
    const panesObj = JSON.parse(panesJson);

    // 假设我们要修改的 pane 是 panes 对象中的第一个键
    // （Grafana URL 中的 pane key 可能是随机的，如 "lou", "p3r", etc.）
    const firstPaneKey = Object.keys(panesObj)[0];
    if (!firstPaneKey || !panesObj[firstPaneKey].range) {
        throw new Error('Could not find a valid pane or range object in URL.');
    }
    
    // 更新 from 和 to，注意 Grafana 需要的是字符串格式的毫秒数
    panesObj[firstPaneKey].range.from = String(fromTimestamp);
    panesObj[firstPaneKey].range.to = String(toTimestamp);

    const newPanesJson = JSON.stringify(panesObj);
    params.set('panes', newPanesJson);
    
    url.search = params.toString();
    return url.href;
}
