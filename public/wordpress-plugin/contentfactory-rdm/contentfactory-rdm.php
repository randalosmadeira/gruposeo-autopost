<?php
/**
 * Plugin Name: Zica.ai - Compatibility Loader
 * Description: Loader temporário para instalações existentes. O código canônico está em ../zica-ai/zica-ai-connector.php.
 * Version: 3.8.0
 * Author: Equipe Zica.ai
 * Text Domain: zica-ai
 */
if (!defined('ABSPATH')) exit;
require_once dirname(__DIR__) . '/zica-ai/zica-ai-connector.php';
