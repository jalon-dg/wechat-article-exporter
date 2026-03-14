#!/bin/bash
# 一键启动多终端开发环境 + 错误监控
# 在新的 Terminal 窗口中运行此脚本

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 启动多终端开发环境 ===${NC}"

# 检查是否在 Terminal 中运行
if [ ! -t 0 ]; then
    echo "请在 Terminal.app 中运行此脚本"
    exit 1
fi

# 日志目录
LOG_DIR="$PROJECT_DIR/logs/services"
mkdir -p "$LOG_DIR"

# 启动终端1: 小程序后端
echo -e "${GREEN}[终端1] 启动小程序后端 (端口 3001)${NC}"
osascript -e "
tell application \"Terminal\"
    activate
    do script \"cd '$PROJECT_DIR' && HOST=0.0.0.0 PORT=3001 yarn miniapp:dev 2>&1 | tee '$LOG_DIR/miniapp.log'\"
    set custom title of front window to \"小程序后端 (3001)\"
end tell
" &
sleep 1

# 启动终端2: Web服务
echo -e "${GREEN}[终端2] 启动 Web 服务 (端口 3000)${NC}"
osascript -e "
tell application \"Terminal\"
    activate
    do script \"cd '$PROJECT_DIR' && yarn web:dev 2>&1 | tee '$LOG_DIR/web.log'\"
    set custom title of front window to \"Web服务 (3000)\"
end tell
" &
sleep 1

# 启动终端3: 错误监控
echo -e "${GREEN}[终端3] 启动错误监控 Agent${NC}"
osascript -e "
tell application \"Terminal\"
    activate
    do script \"cd '$PROJECT_DIR' && bash scripts/monitor-agent.sh\"
    set custom title of front window to \"错误监控 Agent\"
end tell
" &
sleep 1

# 启动终端4: 微信开发者工具 (如果有)
devtools_path="/Applications/wechatwebdevtools.app"
if [ -d "$devtools_path" ]; then
    echo -e "${GREEN}[终端4] 打开微信开发者工具${NC}"
    open "$devtools_path"
fi

echo ""
echo -e "${BLUE}开发环境已启动！${NC}"
echo ""
echo "服务端口:"
echo "  - 小程序后端: http://localhost:3001"
echo "  - Web服务:    http://localhost:3000"
echo ""
echo "日志位置: $LOG_DIR"
echo ""
echo "请切换到对应终端查看运行状态"