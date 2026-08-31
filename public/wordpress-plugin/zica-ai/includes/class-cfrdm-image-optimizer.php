<?php
/**
 * Image Optimizer Class - Automatic image optimization for articles
 */

if (!defined('ABSPATH')) {
    exit;
}

class CFRDM_Image_Optimizer {
    
    /**
     * Optimize image on upload
     */
    public static function optimize_on_upload($attachment_id) {
        if (!get_option('cfrdm_auto_optimize_images', true)) {
            return;
        }
        
        $file_path = get_attached_file($attachment_id);
        $mime_type = get_post_mime_type($attachment_id);
        
        // Only process images
        if (strpos($mime_type, 'image/') !== 0) {
            return;
        }
        
        // Skip SVG and GIF
        if (in_array($mime_type, array('image/svg+xml', 'image/gif'))) {
            return;
        }
        
        $result = self::optimize_image($file_path, $mime_type);
        
        if ($result['success']) {
            CFRDM_Logger::success('image', 'Imagem otimizada no upload', array(
                'attachment_id' => $attachment_id,
                'original_size' => $result['original_size'],
                'new_size' => $result['new_size'],
                'savings_percent' => $result['savings_percent'],
            ), $attachment_id);
        }
    }
    
    /**
     * Optimize thumbnails after generation
     */
    public static function optimize_thumbnails($metadata, $attachment_id) {
        if (!get_option('cfrdm_auto_optimize_images', true)) {
            return $metadata;
        }
        
        if (empty($metadata['sizes'])) {
            return $metadata;
        }
        
        $upload_dir = wp_upload_dir();
        $base_dir = trailingslashit(dirname(get_attached_file($attachment_id)));
        $mime_type = get_post_mime_type($attachment_id);
        
        foreach ($metadata['sizes'] as $size => $size_data) {
            $thumb_path = $base_dir . $size_data['file'];
            if (file_exists($thumb_path)) {
                self::optimize_image($thumb_path, $mime_type, false);
            }
        }
        
        return $metadata;
    }
    
    /**
     * Optimize a single image
     */
    public static function optimize_image($file_path, $mime_type = null, $log = true) {
        if (!file_exists($file_path)) {
            return array('success' => false, 'error' => 'File not found');
        }
        
        if (!$mime_type) {
            $mime_type = wp_check_filetype($file_path)['type'];
        }
        
        $max_width = get_option('cfrdm_image_max_width', 1200);
        $quality = get_option('cfrdm_image_quality', 85);
        $original_size = filesize($file_path);
        
        // Get image editor
        $editor = wp_get_image_editor($file_path);
        
        if (is_wp_error($editor)) {
            return array('success' => false, 'error' => $editor->get_error_message());
        }
        
        // Get current dimensions
        $size = $editor->get_size();
        $resized = false;
        
        // Resize if wider than max width
        if ($size['width'] > $max_width) {
            $editor->resize($max_width, null, false);
            $resized = true;
        }
        
        // Set quality
        $editor->set_quality($quality);
        
        // Save
        $saved = $editor->save($file_path);
        
        if (is_wp_error($saved)) {
            return array('success' => false, 'error' => $saved->get_error_message());
        }
        
        $new_size = filesize($file_path);
        $savings = $original_size - $new_size;
        $savings_percent = $original_size > 0 ? round(($savings / $original_size) * 100, 1) : 0;
        
        return array(
            'success' => true,
            'original_size' => $original_size,
            'new_size' => $new_size,
            'savings' => $savings,
            'savings_percent' => $savings_percent,
            'resized' => $resized,
            'new_dimensions' => $editor->get_size(),
        );
    }
    
    /**
     * Bulk optimize existing images
     */
    public static function bulk_optimize($limit = 50, $offset = 0) {
        $attachments = get_posts(array(
            'post_type' => 'attachment',
            'post_mime_type' => array('image/jpeg', 'image/png', 'image/webp'),
            'posts_per_page' => $limit,
            'offset' => $offset,
            'post_status' => 'any',
            'meta_query' => array(
                array(
                    'key' => '_cfrdm_optimized',
                    'compare' => 'NOT EXISTS',
                ),
            ),
        ));
        
        $results = array(
            'processed' => 0,
            'optimized' => 0,
            'failed' => 0,
            'total_savings' => 0,
            'errors' => array(),
        );
        
        foreach ($attachments as $attachment) {
            $file_path = get_attached_file($attachment->ID);
            $mime_type = $attachment->post_mime_type;
            
            $result = self::optimize_image($file_path, $mime_type);
            $results['processed']++;
            
            if ($result['success']) {
                $results['optimized']++;
                $results['total_savings'] += $result['savings'];
                update_post_meta($attachment->ID, '_cfrdm_optimized', current_time('mysql'));
                update_post_meta($attachment->ID, '_cfrdm_original_size', $result['original_size']);
            } else {
                $results['failed']++;
                $results['errors'][] = array(
                    'attachment_id' => $attachment->ID,
                    'error' => $result['error'],
                );
            }
        }
        
        CFRDM_Logger::info('image', 'Otimização em massa executada', $results);
        
        return $results;
    }
    
    /**
     * Get optimization stats
     */
    public static function get_stats() {
        global $wpdb;
        
        // Total images
        $total_images = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'attachment' 
             AND post_mime_type LIKE 'image/%'
             AND post_mime_type NOT IN ('image/svg+xml', 'image/gif')"
        );
        
        // Optimized images
        $optimized = $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_optimized'"
        );
        
        // Total savings
        $original_sizes = $wpdb->get_var(
            "SELECT SUM(meta_value) FROM {$wpdb->postmeta} 
             WHERE meta_key = '_cfrdm_original_size'"
        );
        
        // Current size of optimized images
        $optimized_ids = $wpdb->get_col(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_cfrdm_optimized'"
        );
        
        $current_size = 0;
        foreach ($optimized_ids as $id) {
            $file = get_attached_file($id);
            if ($file && file_exists($file)) {
                $current_size += filesize($file);
            }
        }
        
        $total_savings = $original_sizes ? ($original_sizes - $current_size) : 0;
        
        return array(
            'total_images' => intval($total_images),
            'optimized' => intval($optimized),
            'pending' => intval($total_images) - intval($optimized),
            'total_savings' => $total_savings,
            'total_savings_formatted' => size_format($total_savings),
        );
    }
    
    /**
     * Create banner/featured image from article content
     */
    public static function generate_featured_image_placeholder($post_id, $title) {
        // This creates a simple placeholder if no featured image exists
        // In a real scenario, this would integrate with an AI image generation service
        
        $has_thumbnail = has_post_thumbnail($post_id);
        
        if ($has_thumbnail) {
            return array('success' => true, 'exists' => true);
        }
        
        // Log that post needs a featured image
        CFRDM_Logger::warning('image', 'Artigo sem imagem destacada', array(
            'post_id' => $post_id,
            'title' => $title,
        ), $post_id);
        
        return array(
            'success' => false,
            'needs_image' => true,
            'message' => 'Artigo precisa de uma imagem destacada',
        );
    }
    
    /**
     * Fix image dimensions for social sharing
     */
    public static function fix_social_image($attachment_id) {
        $file_path = get_attached_file($attachment_id);
        
        if (!$file_path || !file_exists($file_path)) {
            return array('success' => false, 'error' => 'Arquivo não encontrado');
        }
        
        $editor = wp_get_image_editor($file_path);
        
        if (is_wp_error($editor)) {
            return array('success' => false, 'error' => $editor->get_error_message());
        }
        
        $size = $editor->get_size();
        
        // OpenGraph recommended: 1200x630
        $og_width = 1200;
        $og_height = 630;
        
        // Check if we need to create a social version
        if ($size['width'] < $og_width || $size['height'] < $og_height) {
            return array('success' => false, 'needs_larger' => true);
        }
        
        // Create social media sized version
        $upload_dir = wp_upload_dir();
        $filename = pathinfo($file_path, PATHINFO_FILENAME);
        $extension = pathinfo($file_path, PATHINFO_EXTENSION);
        $social_path = $upload_dir['path'] . '/' . $filename . '-social.' . $extension;
        
        $editor->resize($og_width, $og_height, true);
        $saved = $editor->save($social_path);
        
        if (is_wp_error($saved)) {
            return array('success' => false, 'error' => $saved->get_error_message());
        }
        
        // Store reference
        update_post_meta($attachment_id, '_cfrdm_social_image', $saved['path']);
        
        CFRDM_Logger::success('image', 'Imagem social criada', array(
            'attachment_id' => $attachment_id,
            'dimensions' => $og_width . 'x' . $og_height,
        ), $attachment_id);
        
        return array(
            'success' => true,
            'path' => $saved['path'],
            'url' => str_replace($upload_dir['basedir'], $upload_dir['baseurl'], $saved['path']),
        );
    }
}
