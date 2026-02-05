/**
 * ContentFactory RDM - Admin JavaScript
 */

(function($) {
    'use strict';

    // Copy API Key
    $('#cfrdm-copy-key').on('click', function() {
        var $input = $('#cfrdm-api-key');
        $input.select();
        document.execCommand('copy');
        
        var $btn = $(this);
        var originalHTML = $btn.html();
        $btn.html('<span class="dashicons dashicons-yes"></span>');
        
        setTimeout(function() {
            $btn.html(originalHTML);
        }, 2000);
    });

    // Test Connection
    $('#cfrdm-test-connection').on('click', function() {
        var $btn = $(this);
        var originalHTML = $btn.html();
        
        $btn.prop('disabled', true);
        $btn.html('<span class="dashicons dashicons-update spin"></span> ' + 'Testando...');
        
        $.ajax({
            url: cfrdmAdmin.restUrl + 'test',
            method: 'GET',
            headers: {
                'X-CFRDM-API-Key': cfrdmAdmin.apiKey
            },
            success: function(response) {
                if (response.success) {
                    showNotice('success', cfrdmAdmin.strings.testSuccess);
                } else {
                    showNotice('error', response.message || cfrdmAdmin.strings.testError);
                }
            },
            error: function(xhr) {
                var message = cfrdmAdmin.strings.testError;
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    message = xhr.responseJSON.message;
                }
                showNotice('error', message);
            },
            complete: function() {
                $btn.prop('disabled', false);
                $btn.html(originalHTML);
            }
        });
    });

    // Regenerate API Key
    $('#cfrdm-regenerate-key').on('click', function() {
        if (!confirm(cfrdmAdmin.strings.confirm_regenerate)) {
            return;
        }
        
        var $btn = $(this);
        var originalHTML = $btn.html();
        
        $btn.prop('disabled', true);
        $btn.html('<span class="dashicons dashicons-update spin"></span>');
        
        $.ajax({
            url: cfrdmAdmin.restUrl + 'regenerate-key',
            method: 'POST',
            headers: {
                'X-WP-Nonce': cfrdmAdmin.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Update displayed API key
                    $('input[readonly]').filter(function() {
                        return $(this).val() === cfrdmAdmin.apiKey;
                    }).val(response.api_key);
                    
                    cfrdmAdmin.apiKey = response.api_key;
                    
                    showNotice('success', response.message);
                } else {
                    showNotice('error', response.message || 'Erro ao regenerar API Key');
                }
            },
            error: function(xhr) {
                var message = 'Erro ao regenerar API Key';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    message = xhr.responseJSON.message;
                }
                showNotice('error', message);
            },
            complete: function() {
                $btn.prop('disabled', false);
                $btn.html(originalHTML);
            }
        });
    });

    // Show admin notice
    function showNotice(type, message) {
        var $notice = $('<div class="notice notice-' + type + ' is-dismissible"><p>' + message + '</p></div>');
        
        $('.wrap.cfrdm-wrap h1').after($notice);
        
        // Trigger WordPress dismiss functionality
        $(document).trigger('wp-updates-notice-added');
        
        // Auto-dismiss after 5 seconds
        setTimeout(function() {
            $notice.fadeOut(function() {
                $(this).remove();
            });
        }, 5000);
    }

    // Add spinning animation for loading states
    $('<style>')
        .text('.dashicons.spin { animation: cfrdm-spin 1s linear infinite; }' +
              '@keyframes cfrdm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }')
        .appendTo('head');

})(jQuery);
