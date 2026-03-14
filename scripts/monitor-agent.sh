#!/bin/bash
# 错误监控 Agent - 实时监控服务日志错误并尝试自动修复

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/logs/services"
mkdir -p "$LOG_DIR"

LOG_FILE="$PROJECT_DIR/logs/monitor.log"
ERROR_LOG="$PROJECT_DIR/logs/errors.log"

# 创建日志目录
mkdir -p "$PROJECT_DIR/logs"

# 记录每个服务上次检查的行号
declare -A LAST_LINE_MINIAPP
declare -A LAST_LINE_WEB

# 日志函数
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg"
    echo "$msg" >> "$LOG_FILE"
}

error_log() {
    local msg="[ERROR] [$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${RED}$msg${NC}"
    echo "$msg" >> "$ERROR_LOG"
}

# 错误模式匹配
ERROR_PATTERNS="Error:|ERROR|Failed to|Cannot|ENOENT|EADDRINUSE|SyntaxError|TypeError:|ReferenceError:|Module not found|ERR_MODULE_NOT_FOUND|Cannot find module|spawn ENOENT|EACCES|ECONNREFUSED|ERR_DLOPEN_FAILED|uncaughtException"

# 杀掉进程
kill_port() {
    local port=$1
    lsof -ti:$port | xargs kill -9 2>/dev/null
    sleep 1
}

# 修复函数
fix_error() {
    local error_msg="$1"
    local service="$2"

    echo -e "${YELLOW}尝试自动修复...${NC}"

    # 端口占用错误
    if echo "$error_msg" | grep -q "EADDRINUSE\|EACCES"; then
        local port=$(echo "$error_msg" | grep -oE "[0-9]{4,5}" | head -1)
        if [ -n "$port" ]; then
            echo "检测到端口 $port 占用，尝试释放..."
            kill_port "$port"
            return 1  # 需要重启
        fi
    fi

    # Node模块版本不匹配
    if echo "$error_msg" | grep -q "NODE_MODULE_VERSION\|ERR_DLOPEN_FAILED"; then
        echo "检测到模块版本不匹配，重新编译..."
        npm rebuild better-sqlite3 2>/dev/null
        return 1
    fi

    # 模块未找到
    if echo "$error_msg" | grep -q "Module not found\|Cannot find module\|ENOENT"; then
        echo "检测到模块缺失，尝试重新安装..."
        yarn install 2>/dev/null
        return 1
    fi

    # 语法错误或类型错误 - 需要人工介入
    if echo "$error_msg" | grep -q "SyntaxError\|TypeError\|ReferenceError"; then
        error_log "[$service] 需要人工修复: $error_msg"
        return 2  # 需要人工干预
    fi

    return 0
}

# 实时监控日志文件
tail_log() {
    local log_file="$1"
    local service_name="$2"
    local last_line_var="LAST_LINE_${service_name^^}"

    if [ ! -f "$log_file" ]; then
        return
    fi

    local total_lines=$(wc -l < "$log_file")
    local last_line=${!last_line_var:-0}

    if [ "$total_lines" -le "$last_line" ]; then
        return
    fi

    # 读取新行
    local new_lines=$(sed -n "$((last_line + 1)),${total_lines}p" "$log_file")

    # 检查错误
    if echo "$new_lines" | grep -qE "$ERROR_PATTERNS"; then
        local errors=$(echo "$new_lines" | grep -E "$ERROR_PATTERNS" | head -3)
        echo ""
        error_log "=== $service_name 错误 ==="
        echo "$errors" | while read -r line; do
            error_log "  $line"
            fix_error "$line" "$service_name"
        done
    fi

    # 更新行号
    declare -g "$last_line_var=$total_lines"
}

# 监控端口
check_port() {
    local port=$1
    lsof -i:$port > /dev/null 2>&1
}

# 主监控循环
main() {
    log "=== 错误监控 Agent 启动 ==="
    log "项目目录: $PROJECT_DIR"

    echo -e "${BLUE}=== 错误监控 Agent ===${NC}"
    echo ""
    echo "监控服务:"
    echo "  - 小程序后端 (端口 3001) -> $LOG_DIR/miniapp.log"
    echo "  - Web服务 (端口 3000) -> $LOG_DIR/web.log"
    echo ""
    echo "日志文件: $LOG_FILE"
    echo "错误日志: $ERROR_LOG"
    echo ""
    echo "按 Ctrl+C 停止监控"
    echo ""

    # 持续监控
    while true; do
        # 检查服务是否运行
        if ! check_port 3001; then
            error_log "小程序后端 (端口 3001) 未运行"
        fi

        if ! check_port 3000; then
            error_log "Web服务 (端口 3000) 未运行"
        fi

        # 实时监控日志
        tail_log "$LOG_DIR/miniapp.log" "小程序后端"
        tail_log "$LOG_DIR/web.log" "Web服务"

        sleep 3
    done
}

# 如果直接运行此脚本
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi