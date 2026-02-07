<?php
/**
 * Media Handler - Advanced image/media management with deduplication and retry logic
 * 
 * Features:
 * - MD5 hash deduplication to prevent duplicate image downloads
 * - Exponential backoff retry for failed downloads
 * - External URL replacement in content
 * - WebP optimization support
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Media {
    
    /**
     * Maximum number of retry attempts for media downloads
     */
    const MAX_RETRIES = 3;
    
    /**
     * Base delay in seconds for exponential backoff
     */
    const BASE_DELAY = 1;
    
    /**
     * Meta key for storing URL hash
     */
    const HASH_META_KEY = '_cfrdm_source_url_hash';
    
    /**
     * Meta key for storing original source URL
     */
    const SOURCE_URL_META_KEY = '_cfrdm_source_url';
    
    /**
     * Download and import image from URL with deduplication
     * 
     * @param string $image_url Source URL of the image
     * @param int $post_id Optional post ID to attach the image to
     * @param array $options Additional options (alt, title, filename)
     * @return array|WP_Error Result array with attachment_id and url, or WP_Error on failure
     */
    public static function import_image($image_url, $post_id = 0, $options = array()) {
        if (empty($image_url)) {
            return new WP_Error('empty_url', __('URL da imagem não fornecida.', 'contentfactory-rdm'));
        }
        
        // Generate MD5 hash of source URL for deduplication
        $url_hash = md5($image_url);
        
        // Check for existing attachment with same hash
        $existing = self::find_existing_attachment($url_hash);
        if ($existing) {
            CFRDM_Logger::info('media', 'Imagem duplicada detectada - usando existente', array(
                'url_hash' => $url_hash,
                'existing_id' => $existing['id'],
                'source_url' => $image_url,
            ));
            
            return array(
                'success' => true,
                'attachment_id' => $existing['id'],
                'url' => $existing['url'],
                'deduplicated' => true,
            );
        }
        
        // Download image with retry logic
        $download_result = self::download_with_retry($image_url);
        
        if (is_wp_error($download_result)) {
            CFRDM_Logger::error('media', 'Falha ao baixar imagem após retentativas', array(
                'url' => $image_url,
                'error' => $download_result->get_error_message(),
            ));
            return $download_result;
        }
        
        $tmp_file = $download_result['file'];
        $content_type = $download_result['content_type'];
        
        // Generate filename
        $filename = self::generate_filename($image_url, $options, $content_type);
        
        // Move to uploads directory
        $upload = wp_upload_bits($filename, null, file_get_contents($tmp_file));
        @unlink($tmp_file);
        
        if ($upload['error']) {
            return new WP_Error('upload_failed', $upload['error']);
        }
        
        // Create attachment
        $attachment = array(
            'post_mime_type' => $content_type ?: wp_check_filetype($filename)['type'],
            'post_title' => sanitize_text_field($options['title'] ?? pathinfo($filename, PATHINFO_FILENAME)),
            'post_content' => '',
            'post_status' => 'inherit',
        );
        
        $attach_id = wp_insert_attachment($attachment, $upload['file'], $post_id);
        
        if (is_wp_error($attach_id)) {
            return $attach_id;
        }
        
        // Generate metadata
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
        wp_update_attachment_metadata($attach_id, $attach_data);
        
        // Store hash and source URL for deduplication
        update_post_meta($attach_id, self::HASH_META_KEY, $url_hash);
        update_post_meta($attach_id, self::SOURCE_URL_META_KEY, $image_url);
        
        // Set alt text
        if (!empty($options['alt'])) {
            update_post_meta($attach_id, '_wp_attachment_image_alt', sanitize_text_field($options['alt']));
        }
        
        CFRDM_Logger::success('media', 'Imagem importada com sucesso', array(
            'attachment_id' => $attach_id,
            'source_url' => $image_url,
            'url_hash' => $url_hash,
        ), $attach_id);
        
        return array(
            'success' => true,
            'attachment_id' => $attach_id,
            'url' => wp_get_attachment_url($attach_id),
            'deduplicated' => false,
        );
    }
    
    /**
     * Find existing attachment by URL hash
     * 
     * @param string $url_hash MD5 hash of source URL
     * @return array|null Attachment data or null if not found
     */
    public static function find_existing_attachment($url_hash) {
        global $wpdb;
        
        $attachment_id = $wpdb->get_var($wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} 
             WHERE meta_key = %s AND meta_value = %s 
             LIMIT 1",
            self::HASH_META_KEY,
            $url_hash
        ));
        
        if ($attachment_id) {
            $url = wp_get_attachment_url($attachment_id);
            if ($url) {
                return array(
                    'id' => intval($attachment_id),
                    'url' => $url,
                );
            }
        }
        
        return null;
    }
    
    /**
     * Download file with exponential backoff retry
     * 
     * @param string $url URL to download
     * @return array|WP_Error Downloaded file info or error
     */
    public static function download_with_retry($url) {
        $last_error = null;
        
        for ($attempt = 1; $attempt <= self::MAX_RETRIES; $attempt++) {
            // Download with increased timeout
            $tmp_file = download_url($url, 60);
            
            if (!is_wp_error($tmp_file)) {
                // Success - get content type
                $content_type = self::detect_content_type($tmp_file, $url);
                
                return array(
                    'file' => $tmp_file,
                    'content_type' => $content_type,
                );
            }
            
            $last_error = $tmp_file;
            
            // Log retry attempt
            CFRDM_Logger::warning('media', sprintf(
                'Tentativa %d/%d falhou - aguardando antes de tentar novamente',
                $attempt,
                self::MAX_RETRIES
            ), array(
                'url' => $url,
                'error' => $tmp_file->get_error_message(),
            ));
            
            // Don't wait after last attempt
            if ($attempt < self::MAX_RETRIES) {
                // Exponential backoff: 1s, 2s, 4s...
                $delay = self::BASE_DELAY * pow(2, $attempt - 1);
                sleep($delay);
            }
        }
        
        return $last_error;
    }
    
    /**
     * Detect content type of downloaded file
     * 
     * @param string $file_path Path to file
     * @param string $url Original URL
     * @return string MIME type
     */
    private static function detect_content_type($file_path, $url) {
        // Try PHP's finfo
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file_path);
            finfo_close($finfo);
            if ($mime && $mime !== 'application/octet-stream') {
                return $mime;
            }
        }
        
        // Fallback to extension-based detection
        $extension = pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION);
        $types = array(
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'bmp' => 'image/bmp',
            'avif' => 'image/avif',
        );
        
        return $types[strtolower($extension)] ?? 'image/jpeg';
    }
    
    /**
     * Generate appropriate filename for imported image
     * 
     * @param string $url Source URL
     * @param array $options Options with possible filename override
     * @param string $content_type MIME type
     * @return string Sanitized filename
     */
    private static function generate_filename($url, $options, $content_type) {
        if (!empty($options['filename'])) {
            return sanitize_file_name($options['filename']);
        }
        
        // Extract from URL
        $url_path = parse_url($url, PHP_URL_PATH);
        $original_name = pathinfo($url_path, PATHINFO_FILENAME);
        
        // Clean up common CDN/parameter cruft
        $original_name = preg_replace('/[-_]?\d{10,}/', '', $original_name);
        $original_name = preg_replace('/[-_]?(thumb|large|medium|small|\d+x\d+)$/i', '', $original_name);
        
        if (empty($original_name)) {
            $original_name = 'image-' . time();
        }
        
        // Get extension from content type
        $extensions = array(
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'image/svg+xml' => 'svg',
            'image/bmp' => 'bmp',
            'image/avif' => 'avif',
        );
        
        $extension = $extensions[$content_type] ?? 'jpg';
        
        return sanitize_file_name($original_name . '.' . $extension);
    }
    
    /**
     * Replace external image URLs in content with local media library URLs
     * 
     * @param string $content Post content
     * @param int $post_id Post ID
     * @param array $options Import options
     * @return array Result with updated content and import stats
     */
    public static function replace_external_images($content, $post_id, $options = array()) {
        $stats = array(
            'found' => 0,
            'imported' => 0,
            'deduplicated' => 0,
            'failed' => 0,
            'skipped' => 0,
        );
        
        // Find all img tags
        preg_match_all('/<img[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $content, $matches);
        
        if (empty($matches[1])) {
            return array(
                'content' => $content,
                'stats' => $stats,
            );
        }
        
        $site_url = get_site_url();
        $replacements = array();
        
        foreach ($matches[1] as $index => $image_url) {
            $stats['found']++;
            
            // Skip if already local
            if (strpos($image_url, $site_url) === 0) {
                $stats['skipped']++;
                continue;
            }
            
            // Skip data URIs
            if (strpos($image_url, 'data:') === 0) {
                $stats['skipped']++;
                continue;
            }
            
            // Extract alt text from img tag if available
            $alt = '';
            if (preg_match('/alt=["\']([^"\']*)["\']/', $matches[0][$index], $alt_match)) {
                $alt = $alt_match[1];
            }
            
            // Import image
            $result = self::import_image($image_url, $post_id, array(
                'alt' => $alt ?: ($options['alt'] ?? ''),
            ));
            
            if (is_wp_error($result)) {
                $stats['failed']++;
                continue;
            }
            
            if ($result['deduplicated']) {
                $stats['deduplicated']++;
            } else {
                $stats['imported']++;
            }
            
            $replacements[$image_url] = $result['url'];
        }
        
        // Replace URLs in content
        foreach ($replacements as $old_url => $new_url) {
            $content = str_replace($old_url, $new_url, $content);
        }
        
        // Log summary
        if ($stats['found'] > 0) {
            CFRDM_Logger::info('media', 'Substituição de imagens externas concluída', array_merge(
                $stats,
                array('post_id' => $post_id)
            ), $post_id);
        }
        
        return array(
            'content' => $content,
            'stats' => $stats,
        );
    }
    
    /**
     * Import image from URL specifically for featured image
     * 
     * @param string $image_url Image URL
     * @param int $post_id Post ID
     * @param array $options Import options
     * @return int|WP_Error Attachment ID or error
     */
    public static function import_featured_image($image_url, $post_id, $options = array()) {
        $result = self::import_image($image_url, $post_id, $options);
        
        if (is_wp_error($result)) {
            return $result;
        }
        
        // Set as featured image
        set_post_thumbnail($post_id, $result['attachment_id']);
        
        return $result['attachment_id'];
    }
    
    /**
     * Upload media from base64 data with deduplication
     * 
     * @param string $base64_data Base64 encoded image data
     * @param int $post_id Optional post ID
     * @param array $options Additional options
     * @return array|WP_Error Result array or error
     */
    public static function upload_base64($base64_data, $post_id = 0, $options = array()) {
        // Remove data URI prefix if present
        $image_data = preg_replace('/^data:image\/\w+;base64,/', '', $base64_data);
        $decoded = base64_decode($image_data);
        
        if ($decoded === false) {
            return new WP_Error('invalid_data', __('Dados base64 inválidos.', 'contentfactory-rdm'));
        }
        
        // Generate hash for deduplication
        $content_hash = md5($decoded);
        
        // Check for existing by content hash
        $existing = self::find_existing_by_content_hash($content_hash);
        if ($existing) {
            return array(
                'success' => true,
                'attachment_id' => $existing['id'],
                'url' => $existing['url'],
                'deduplicated' => true,
            );
        }
        
        // Generate filename
        $filename = sanitize_file_name($options['filename'] ?? 'image-' . time() . '.png');
        
        // Detect mime type from content
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_buffer($finfo, $decoded);
            finfo_close($finfo);
        } else {
            $mime = 'image/png';
        }
        
        // Upload
        $upload = wp_upload_bits($filename, null, $decoded);
        
        if ($upload['error']) {
            return new WP_Error('upload_failed', $upload['error']);
        }
        
        // Create attachment
        $attachment = array(
            'post_mime_type' => $mime,
            'post_title' => sanitize_text_field($options['title'] ?? pathinfo($filename, PATHINFO_FILENAME)),
            'post_content' => '',
            'post_status' => 'inherit',
        );
        
        $attach_id = wp_insert_attachment($attachment, $upload['file'], $post_id);
        
        if (is_wp_error($attach_id)) {
            return $attach_id;
        }
        
        // Generate metadata
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
        wp_update_attachment_metadata($attach_id, $attach_data);
        
        // Store content hash
        update_post_meta($attach_id, '_cfrdm_content_hash', $content_hash);
        
        // Set alt text
        if (!empty($options['alt'])) {
            update_post_meta($attach_id, '_wp_attachment_image_alt', sanitize_text_field($options['alt']));
        }
        
        return array(
            'success' => true,
            'attachment_id' => $attach_id,
            'url' => wp_get_attachment_url($attach_id),
            'deduplicated' => false,
        );
    }
    
    /**
     * Find existing attachment by content hash
     */
    private static function find_existing_by_content_hash($hash) {
        global $wpdb;
        
        $attachment_id = $wpdb->get_var($wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_content_hash' AND meta_value = %s 
             LIMIT 1",
            $hash
        ));
        
        if ($attachment_id) {
            $url = wp_get_attachment_url($attachment_id);
            if ($url) {
                return array(
                    'id' => intval($attachment_id),
                    'url' => $url,
                );
            }
        }
        
        return null;
    }
    
    /**
     * Get deduplication statistics
     */
    public static function get_stats() {
        global $wpdb;
        
        $total_hashed = $wpdb->get_var(
            "SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} 
             WHERE meta_key = '" . self::HASH_META_KEY . "'"
        );
        
        // Estimate savings by counting duplicates that were not imported
        $unique_hashes = $wpdb->get_var(
            "SELECT COUNT(DISTINCT meta_value) FROM {$wpdb->postmeta} 
             WHERE meta_key = '" . self::HASH_META_KEY . "'"
        );
        
        return array(
            'total_tracked' => intval($total_hashed),
            'unique_sources' => intval($unique_hashes),
            'potential_duplicates_prevented' => max(0, intval($total_hashed) - intval($unique_hashes)),
        );
    }
    
    /**
     * Convert image to WebP format (inspired by SIFET pattern)
     * 
     * @param int $attachment_id Attachment ID
     * @param string $file_path Path to original file
     * @return int|false WebP attachment ID or false on failure
     */
    public static function convert_to_webp($attachment_id, $file_path = null) {
        // Check if WebP conversion is enabled
        if (!get_option('cfrdm_convert_webp', false)) {
            return false;
        }
        
        // Check if already converted
        if (get_post_meta($attachment_id, '_cfrdm_webp_converted', true)) {
            return get_post_meta($attachment_id, '_cfrdm_webp_id', true);
        }
        
        // Get file path if not provided
        if (empty($file_path)) {
            $file_path = get_attached_file($attachment_id);
        }
        
        if (!$file_path || !file_exists($file_path)) {
            return false;
        }
        
        // Only convert JPEG and PNG
        $mime = wp_check_filetype($file_path)['type'];
        if (!in_array($mime, array('image/jpeg', 'image/png', 'image/jpg'), true)) {
            return false;
        }
        
        // Check WebP support
        if (!self::is_webp_supported()) {
            return false;
        }
        
        try {
            $webp_path = preg_replace('/\.(jpe?g|png)$/i', '.webp', $file_path);
            $converted = false;
            
            // Try GD first
            if (function_exists('imagewebp')) {
                $converted = self::convert_with_gd($file_path, $webp_path);
            } elseif (class_exists('Imagick')) {
                $converted = self::convert_with_imagick($file_path, $webp_path);
            }
            
            if ($converted && file_exists($webp_path)) {
                // Create attachment for WebP
                $webp_attachment = array(
                    'post_mime_type' => 'image/webp',
                    'post_title' => get_the_title($attachment_id) . ' (WebP)',
                    'post_content' => '',
                    'post_status' => 'inherit',
                );
                
                $parent = wp_get_post_parent_id($attachment_id);
                $webp_id = wp_insert_attachment($webp_attachment, $webp_path, $parent);
                
                if (!is_wp_error($webp_id)) {
                    require_once(ABSPATH . 'wp-admin/includes/image.php');
                    $attach_data = wp_generate_attachment_metadata($webp_id, $webp_path);
                    wp_update_attachment_metadata($webp_id, $attach_data);
                    
                    // Mark as converted
                    update_post_meta($attachment_id, '_cfrdm_webp_converted', true);
                    update_post_meta($attachment_id, '_cfrdm_webp_id', $webp_id);
                    update_post_meta($webp_id, '_cfrdm_webp_original', $attachment_id);
                    
                    if (class_exists('CFRDM_Logger')) {
                        CFRDM_Logger::success('media', 'Imagem convertida para WebP', array(
                            'original_id' => $attachment_id,
                            'webp_id' => $webp_id,
                        ), $attachment_id);
                    }
                    
                    return $webp_id;
                }
            }
        } catch (Exception $e) {
            if (class_exists('CFRDM_Logger')) {
                CFRDM_Logger::error('media', 'Falha ao converter para WebP: ' . $e->getMessage());
            }
        }
        
        return false;
    }
    
    /**
     * Check if WebP is supported on this server
     */
    private static function is_webp_supported() {
        if (function_exists('imagewebp')) {
            return true;
        }
        
        if (class_exists('Imagick')) {
            $imagick = new Imagick();
            return in_array('WEBP', $imagick->queryFormats(), true);
        }
        
        return false;
    }
    
    /**
     * Convert image using GD library
     */
    private static function convert_with_gd($source, $destination) {
        $info = getimagesize($source);
        if ($info === false) {
            return false;
        }
        
        $image = null;
        
        switch ($info['mime']) {
            case 'image/jpeg':
            case 'image/jpg':
                $image = imagecreatefromjpeg($source);
                break;
            case 'image/png':
                $image = imagecreatefrompng($source);
                imagepalettetotruecolor($image);
                imagealphablending($image, true);
                imagesavealpha($image, true);
                break;
        }
        
        if ($image === null) {
            return false;
        }
        
        $quality = (int) get_option('cfrdm_webp_quality', 80);
        $result = imagewebp($image, $destination, $quality);
        imagedestroy($image);
        
        return $result;
    }
    
    /**
     * Convert image using Imagick
     */
    private static function convert_with_imagick($source, $destination) {
        try {
            $imagick = new Imagick($source);
            $imagick->setImageFormat('webp');
            
            $quality = (int) get_option('cfrdm_webp_quality', 80);
            $imagick->setImageCompressionQuality($quality);
            
            $result = $imagick->writeImage($destination);
            $imagick->clear();
            $imagick->destroy();
            
            return $result;
        } catch (Exception $e) {
            return false;
        }
    }
}
