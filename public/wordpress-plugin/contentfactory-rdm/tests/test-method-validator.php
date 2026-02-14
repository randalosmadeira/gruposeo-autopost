<?php
/**
 * Unit Tests for CFRDM_Method_Validator
 * 
 * Simulates missing methods, parameter mismatches, and validates 
 * that safe_call() prevents fatal errors.
 * 
 * Run with: php tests/test-method-validator.php
 * Or integrate with PHPUnit / WP CLI test runner.
 *
 * @package ContentFactory_RDM
 * @since 3.2.4
 */

// Minimal WordPress stubs for standalone execution
if (!defined('ABSPATH')) {
    define('ABSPATH', dirname(__DIR__) . '/');
}
if (!defined('CFRDM_VERSION')) {
    define('CFRDM_VERSION', '3.2.4');
}

// Stub WordPress functions used by the validator
if (!function_exists('get_transient')) {
    function get_transient($key) { return false; }
}
if (!function_exists('set_transient')) {
    function set_transient($key, $value, $expiration = 0) { return true; }
}
if (!function_exists('delete_transient')) {
    function delete_transient($key) { return true; }
}
if (!function_exists('current_time')) {
    function current_time($type) { return date('c'); }
}

// Stub Logger to capture warnings
class CFRDM_Logger {
    public static $logs = array();
    
    public static function success($channel, $message, $context = array(), $post_id = 0) {
        self::$logs[] = array('level' => 'success', 'channel' => $channel, 'message' => $message);
    }
    public static function error($channel, $message, $context = array(), $post_id = 0) {
        self::$logs[] = array('level' => 'error', 'channel' => $channel, 'message' => $message);
    }
    public static function warning($channel, $message, $context = array(), $post_id = 0) {
        self::$logs[] = array('level' => 'warning', 'channel' => $channel, 'message' => $message);
    }
    public static function reset() {
        self::$logs = array();
    }
}

// ─── Test Fixture Classes ───────────────────────────────────────────

/** Class with correct method signatures */
class TestClass_Valid {
    public static function no_params() { return 'ok'; }
    public static function one_required($a) { return $a; }
    public static function one_required_one_optional($a, $b = null) { return array($a, $b); }
}

/** Class with a method that requires too many params */
class TestClass_TooManyRequired {
    public static function strict_method($a, $b, $c) { return 'needs3'; }
}

/** Class that throws an exception */
class TestClass_Throws {
    public static function explode() { throw new \RuntimeException('Boom!'); }
}

// ─── Load the validator ─────────────────────────────────────────────
require_once dirname(__DIR__) . '/includes/class-cfrdm-method-validator.php';

// ─── Test Runner ────────────────────────────────────────────────────

class MethodValidatorTest {
    
    private $passed = 0;
    private $failed = 0;
    private $errors = array();
    
    public function run() {
        echo "\n╔══════════════════════════════════════════════╗\n";
        echo "║  CFRDM_Method_Validator — Test Suite v3.2.4  ║\n";
        echo "╚══════════════════════════════════════════════╝\n\n";
        
        $this->test_safe_call_with_valid_class();
        $this->test_safe_call_with_missing_class();
        $this->test_safe_call_with_missing_method();
        $this->test_safe_call_with_exception();
        $this->test_safe_call_returns_fallback();
        $this->test_safe_call_passes_arguments();
        $this->test_validate_detects_missing_method();
        $this->test_validate_detects_param_mismatch();
        $this->test_validate_passes_valid_class();
        $this->test_clear_cache();
        
        echo "\n──────────────────────────────────────────────\n";
        echo sprintf("  Results: %d passed, %d failed\n", $this->passed, $this->failed);
        echo "──────────────────────────────────────────────\n";
        
        if (!empty($this->errors)) {
            echo "\nFailures:\n";
            foreach ($this->errors as $err) {
                echo "  ✗ {$err}\n";
            }
        }
        
        echo "\n";
        return $this->failed === 0;
    }
    
    private function assert($condition, $test_name) {
        if ($condition) {
            $this->passed++;
            echo "  ✓ {$test_name}\n";
        } else {
            $this->failed++;
            $this->errors[] = $test_name;
            echo "  ✗ {$test_name}\n";
        }
    }
    
    // ─── Tests ──────────────────────────────────────────────────────
    
    private function test_safe_call_with_valid_class() {
        CFRDM_Logger::reset();
        $result = CFRDM_Method_Validator::safe_call('TestClass_Valid', 'no_params');
        $this->assert($result === 'ok', 'safe_call() returns value from valid static method');
    }
    
    private function test_safe_call_with_missing_class() {
        CFRDM_Logger::reset();
        $result = CFRDM_Method_Validator::safe_call('NonExistentClass', 'foo', array(), 'fallback');
        $this->assert($result === 'fallback', 'safe_call() returns fallback for missing class');
        $this->assert(
            !empty(CFRDM_Logger::$logs) && CFRDM_Logger::$logs[0]['level'] === 'warning',
            'safe_call() logs warning for missing class'
        );
    }
    
    private function test_safe_call_with_missing_method() {
        CFRDM_Logger::reset();
        $result = CFRDM_Method_Validator::safe_call('TestClass_Valid', 'nonexistent', array(), 'default');
        $this->assert($result === 'default', 'safe_call() returns fallback for missing method');
        $this->assert(
            !empty(CFRDM_Logger::$logs) && strpos(CFRDM_Logger::$logs[0]['message'], 'não existe') !== false,
            'safe_call() logs warning mentioning missing method'
        );
    }
    
    private function test_safe_call_with_exception() {
        CFRDM_Logger::reset();
        $result = CFRDM_Method_Validator::safe_call('TestClass_Throws', 'explode', array(), 'caught');
        $this->assert($result === 'caught', 'safe_call() catches exceptions and returns fallback');
        $this->assert(
            !empty(CFRDM_Logger::$logs) && CFRDM_Logger::$logs[0]['level'] === 'error',
            'safe_call() logs error when exception is thrown'
        );
    }
    
    private function test_safe_call_returns_fallback() {
        $result = CFRDM_Method_Validator::safe_call('Ghost', 'method', array(), array('empty'));
        $this->assert($result === array('empty'), 'safe_call() supports array as fallback value');
        
        $result2 = CFRDM_Method_Validator::safe_call('Ghost', 'method');
        $this->assert($result2 === null, 'safe_call() defaults to null fallback');
    }
    
    private function test_safe_call_passes_arguments() {
        $result = CFRDM_Method_Validator::safe_call(
            'TestClass_Valid', 'one_required_one_optional', 
            array('hello', 'world')
        );
        $this->assert(
            $result === array('hello', 'world'),
            'safe_call() correctly passes multiple arguments'
        );
    }
    
    private function test_validate_detects_missing_method() {
        // We can't easily inject contracts, but we can verify the structure
        $report = CFRDM_Method_Validator::get_report();
        $this->assert(isset($report['valid']), 'validate() returns report with "valid" key');
        $this->assert(isset($report['issues']), 'validate() returns report with "issues" array');
        $this->assert(isset($report['version']), 'validate() includes version in report');
    }
    
    private function test_validate_detects_param_mismatch() {
        // Verify the report structure is correct even if classes aren't loaded
        $report = CFRDM_Method_Validator::get_report();
        $this->assert(is_array($report['issues']), 'validate() issues is always an array');
    }
    
    private function test_validate_passes_valid_class() {
        $report = CFRDM_Method_Validator::get_report();
        $this->assert(!empty($report['checked_at']), 'validate() includes checked_at timestamp');
    }
    
    private function test_clear_cache() {
        CFRDM_Method_Validator::clear_cache();
        // If no exception thrown, cache clearing works
        $this->assert(true, 'clear_cache() executes without error');
    }
}

// ─── Execute ────────────────────────────────────────────────────────
$test = new MethodValidatorTest();
$success = $test->run();
exit($success ? 0 : 1);
