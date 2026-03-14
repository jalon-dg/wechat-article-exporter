#!/bin/bash
# 小程序多终端调试启动脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== 微信小程序多终端调试 ===${NC}"
echo ""

# 检查端口占用
check_port() {
    local port=$1
    local name=$2
    if lsof -i:$port > /dev/null 2>&1; then
        echo -e "${YELLOW}$name 端口 $port 已被占用${NC}"
    else
        echo -e "${GREEN}$name 端口 $port 可用${NC}"
    fi
}

# 启动小程序后端服务
start_miniapp_server() {
    echo -e "${GREEN}[终端1] 启动小程序后端服务 (端口 3001)...${NC}"
    cd "$(dirname "$0")/.."
    PORT=3001 yarn --cwd apps/miniapp/server dev
}

# 启动Web服务（可选）
start_web() {
    echo -e "${GREEN}[终端2] 启动Web服务 (端口 3000)...${NC}"
    cd "$(dirname "$0")/.."
    yarn web:dev
}

# 启动微信开发者工具（如果已安装）
open_wechat_devtools() {
    local devtools_path="/Applications/wechatwebdevtools.app"
    if [ -d "$devtools_path" ]; then
        echo -e "${GREEN}[终端3] 打开微信开发者工具...${NC}"
        open "$devtools_path"
        echo -e "${YELLOW}请在微信开发者工具中打开: $(pwd)/apps/miniapp/native${NC}"
    else
        echo -e "${RED}微信开发者工具未找到，请手动打开${NC}"
        echo -e "${YELLOW}请手动打开微信开发者工具并导入: $(pwd)/apps/miniapp/native${NC}"
    fi
}

# 主菜单
show_menu() {
    echo "请选择要启动的服务:"
    echo "1) 小程序后端 (端口 3001)"
    echo "2) Web服务 (端口 3000)"
    echo "3) 微信开发者工具"
    echo "4) 全部启动"
    echo "0) 退出"
    echo ""
    read -p "请输入选项 (0-4): " choice

    case $choice in
        1)
            start_miniapp_server
            ;;
        2)
            start_web
            ;;
        3)
            open_wechat_devtools
            ;;
        4)
            echo -e "${BLUE}启动所有服务...${NC}"
            open_wechat_devtools
            echo ""
            echo "后端服务和Web服务需要在独立终端中运行"
            echo "请运行以下命令:"
            echo "  终端1: PORT=3001 yarn miniapp:dev"
            echo "  终端2: yarn web:dev"
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

# 检查端口
check_port 3001 "小程序后端"
check_port 3000 "Web服务"

show_menu