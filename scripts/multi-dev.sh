#!/bin/bash
# 多终端开发启动器 - 启动多个终端窗口运行不同服务

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}=== 微信小程序多终端开发环境 ===${NC}"
echo ""

# 检查进程是否运行
check_process() {
    local port=$1
    local name=$2
    if lsof -i:$port > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name (端口 $port) - 运行中"
        return 0
    else
        echo -e "${RED}✗${NC} $name (端口 $port) - 未运行"
        return 1
    fi
}

# 在新终端窗口中执行命令
open_terminal() {
    local title="$1"
    local command="$2"

    osascript -e "
    tell application \"Terminal\"
        activate
        do script \"cd '$PROJECT_DIR' && $command\"
        set frontmost to true
    end tell
    " 2>/dev/null

    # 设置窗口标题（通过修改 profile 或直接设置）
    osascript -e "
    tell application \"Terminal\"
        delay 0.5
        set custom title of front window to \"$title\"
    end tell
    " 2>/dev/null
}

# 启动指定服务
start_service() {
    local service_name="$1"
    local command="$2"
    local port="$3"

    echo -e "${GREEN}启动 $service_name...${NC}"
    open_terminal "$service_name" "$command"

    if [ -n "$port" ]; then
        echo -e "  端口: $port"
    fi
}

# 主菜单
show_menu() {
    echo ""
    echo "请选择要启动的服务组合:"
    echo ""
    echo "  ${CYAN}[1]${NC} 全部启动 (后端 + Web + 微信开发者工具)"
    echo "  ${CYAN}[2]${NC} 仅小程序后端 (端口 3001)"
    echo "  ${CYAN}[3]${NC} 小程序后端 + Web"
    echo "  ${CYAN}[4]${NC} 仅 Web (端口 3000)"
    echo "  ${CYAN}[5]${NC} 查看服务状态"
    echo "  ${CYAN}[0]${NC} 退出"
    echo ""
    read -p "请输入选项: " choice

    case $choice in
        1)
            echo -e "${BLUE}启动全部服务...${NC}"
            # 先启动后端
            open_terminal "小程序后端" "PORT=3001 yarn miniapp:dev"
            sleep 1
            # 启动Web
            open_terminal "Web服务" "yarn web:dev"
            sleep 1
            # 打开微信开发者工具
            open_wechat_devtools
            ;;
        2)
            open_terminal "小程序后端" "PORT=3001 yarn miniapp:dev"
            ;;
        3)
            open_terminal "小程序后端" "PORT=3001 yarn miniapp:dev"
            sleep 1
            open_terminal "Web服务" "yarn web:dev"
            ;;
        4)
            open_terminal "Web服务" "yarn web:dev"
            ;;
        5)
            echo ""
            echo "=== 服务状态 ==="
            check_process 3001 "小程序后端"
            check_process 3000 "Web服务"
            show_menu
            ;;
        0)
            echo "退出"
            exit 0
            ;;
        *)
            echo -e "${RED}无效选项${NC}"
            show_menu
            ;;
    esac
}

# 打开微信开发者工具
open_wechat_devtools() {
    local devtools_path="/Applications/wechatwebdevtools.app"
    if [ -d "$devtools_path" ]; then
        echo "打开微信开发者工具..."
        open "$devtools_path"
        sleep 2
        osascript -e 'tell application "System Events" to keystroke "n" using command down' 2>/dev/null
    else
        echo -e "${RED}微信开发者工具未安装${NC}"
        echo "请从 https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html 下载"
    fi
}

# 显示当前状态
show_status() {
    echo ""
    echo "=== 服务状态 ==="
    check_process 3001 "小程序后端"
    check_process 3000 "Web服务"
}

# 主程序
if [ "$1" == "status" ]; then
    show_status
else
    show_status
    show_menu
fi