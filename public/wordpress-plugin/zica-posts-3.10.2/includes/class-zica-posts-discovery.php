<?php
if (!defined('ABSPATH')) exit;

final class Zica_Posts_Discovery {
    private $auth;
    public function __construct($auth) {
        $this->auth=$auth;
        add_action('template_redirect',array($this,'serve_files'),-100);
        add_filter('robots_txt',array($this,'filter_robots_txt'),100,2);
        add_action('wp_head',array($this,'output_rss_alternate'),2);
        add_action('wp_head',array($this,'output_schema'),20);
        add_action('wp_head',array($this,'output_datafeed_schema'),21);
        add_action(ZICA_POSTS_CRON_DISCOVERY,array($this,'refresh_files'));
    }
    public function ai_bots(){return apply_filters('zica_posts_ai_bots',array('OAI-SearchBot','GPTBot','ChatGPT-User','ClaudeBot','Claude-User','anthropic-ai','PerplexityBot','Perplexity-User','Googlebot','Google-Extended','Applebot','Applebot-Extended','CCBot','cohere-ai','meta-externalagent'));}
    public function feed_url(){ $feed=get_feed_link('rss2'); return $feed ? $feed : home_url('/feed/'); }
    private function published_posts($limit){return get_posts(array('post_type'=>array('post','page'),'post_status'=>'publish','posts_per_page'=>absint($limit),'orderby'=>'modified','order'=>'DESC'));}
    private function now_iso(){return (new DateTimeImmutable('now',new DateTimeZone(ZICA_POSTS_TZ)))->format(DateTime::ATOM);}

    public function generate_llms($full=false){
        $posts=$this->published_posts($full?1500:100);$rss=$this->feed_url();
        $out='# '.get_bloginfo('name')."\n\n> ".wp_strip_all_tags(get_bloginfo('description'))."\n\nWebsite: ".home_url('/')."\nLanguage: ".get_bloginfo('language')."\nRSS: ".$rss."\nUpdated: ".$this->now_iso()."\nSoftware: Zica Posts ".ZICA_POSTS_VERSION."\n\n## Discovery resources\n\n- RSS/Atom discovery: ".$rss."\n- Sitemap: ".home_url('/zica-ai-sitemap.xml')."\n- WordPress sitemap: ".home_url('/wp-sitemap.xml')."\n- AI manifest: ".home_url('/zica-ai-manifest.json')."\n- AI policy: ".home_url('/ai.txt')."\n";
        if(!$full)$out.='- Full content index: '.home_url('/llms-full.txt')."\n";
        $out.="\n## Published content\n\n";
        foreach($posts as $post){$excerpt=wp_strip_all_tags($post->post_excerpt?:wp_trim_words($post->post_content,$full?90:30));$out.='- ['.wp_strip_all_tags($post->post_title).']('.get_permalink($post->ID).') — modified '.get_the_modified_date('c',$post).'. '.trim($excerpt)."\n";}
        return $out;
    }

    public function generate_ai_txt(){
        $out="# Zica Posts AI Discovery Policy\nSite: ".home_url('/')."\nRSS: ".$this->feed_url()."\nUpdated: ".$this->now_iso()."\n\nDiscovery resources exposed by this site:\nRSS: ".$this->feed_url()."\nLLMs: ".home_url('/llms.txt')."\nLLMs-Full: ".home_url('/llms-full.txt')."\nSitemap: ".home_url('/zica-ai-sitemap.xml')."\nManifest: ".home_url('/zica-ai-manifest.json')."\n\n# These directives permit crawling; they do not guarantee ingestion, citation or ranking.\n";
        foreach($this->ai_bots() as $bot)$out.='User-agent: '.sanitize_text_field($bot)."\nAllow: /\n\n";
        return $out;
    }

    public function manifest_data(){
        $items=array();foreach($this->published_posts(500) as $post)$items[]=array('id'=>$post->ID,'type'=>$post->post_type,'title'=>wp_strip_all_tags($post->post_title),'url'=>get_permalink($post->ID),'published'=>get_the_date('c',$post),'modified'=>get_the_modified_date('c',$post));
        return array('software_id'=>ZICA_POSTS_SOFTWARE_ID,'version'=>ZICA_POSTS_VERSION,'generated_at'=>$this->now_iso(),'site'=>array('name'=>get_bloginfo('name'),'url'=>home_url('/'),'language'=>get_bloginfo('language')),'resources'=>array('rss'=>$this->feed_url(),'llms'=>home_url('/llms.txt'),'llms_full'=>home_url('/llms-full.txt'),'ai_policy'=>home_url('/ai.txt'),'sitemap'=>home_url('/zica-ai-sitemap.xml'),'wp_sitemap'=>home_url('/wp-sitemap.xml')),'content'=>$items);
    }

    public function generate_sitemap(){
        $xml='<?xml version="1.0" encoding="UTF-8"?>'."\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url><loc>".esc_xml(home_url('/')).'</loc><lastmod>'.esc_xml(gmdate('c'))."</lastmod></url>\n";
        foreach($this->published_posts(10000) as $post)$xml.='  <url><loc>'.esc_xml(get_permalink($post->ID)).'</loc><lastmod>'.esc_xml(get_the_modified_date('c',$post))."</lastmod></url>\n";
        return $xml.'</urlset>';
    }

    private function write_atomic($path,$content){$dir=dirname($path);if(!is_dir($dir)||!is_writable($dir))return false;$tmp=$path.'.zica-'.wp_generate_password(10,false,false).'.tmp';$bytes=@file_put_contents($tmp,(string)$content,LOCK_EX);if(false===$bytes){@unlink($tmp);return false;}if(!@rename($tmp,$path)){@unlink($tmp);return false;}@chmod($path,0644);return true;}
    public function refresh_files(){
        $documents=array('llms.txt'=>$this->generate_llms(false),'llms-full.txt'=>$this->generate_llms(true),'ai.txt'=>$this->generate_ai_txt(),'zica-ai-manifest.json'=>wp_json_encode($this->manifest_data(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),'zica-ai-sitemap.xml'=>$this->generate_sitemap());$status=array();
        foreach($documents as $name=>$content){$physical='1'===(string)get_option('zica_posts_physical_files_enabled','1')?$this->write_atomic(ABSPATH.$name,$content):false;$status[$name]=array('physical'=>(bool)$physical,'virtual_fallback'=>true,'bytes'=>strlen((string)$content),'url'=>home_url('/'.$name));}
        $status['rss']=array('physical'=>false,'virtual_fallback'=>true,'bytes'=>null,'url'=>$this->feed_url());
        $key=(string)get_option('zica_posts_indexnow_key','');if($key){$physical='1'===(string)get_option('zica_posts_physical_files_enabled','1')?$this->write_atomic(ABSPATH.$key.'.txt',$key):false;$status[$key.'.txt']=array('physical'=>(bool)$physical,'virtual_fallback'=>true,'bytes'=>strlen($key),'url'=>home_url('/'.$key.'.txt'));}
        update_option('zica_posts_discovery_files_status',$status,false);return $status;
    }
    public function schedule_refresh($delay=10){if(!wp_next_scheduled(ZICA_POSTS_CRON_DISCOVERY))wp_schedule_single_event(time()+max(1,absint($delay)),ZICA_POSTS_CRON_DISCOVERY);}
    public function serve_files(){
        $path=parse_url(isset($_SERVER['REQUEST_URI'])?$_SERVER['REQUEST_URI']:'',PHP_URL_PATH);if(!$path)return;
        $map=array('/llms.txt'=>array('text/plain; charset=utf-8',$this->generate_llms(false)),'/llms-full.txt'=>array('text/plain; charset=utf-8',$this->generate_llms(true)),'/ai.txt'=>array('text/plain; charset=utf-8',$this->generate_ai_txt()),'/zica-ai-manifest.json'=>array('application/json; charset=utf-8',wp_json_encode($this->manifest_data(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)),'/zica-ai-sitemap.xml'=>array('application/xml; charset=utf-8',$this->generate_sitemap()));
        $key=(string)get_option('zica_posts_indexnow_key','');if($key)$map['/'.$key.'.txt']=array('text/plain; charset=utf-8',$key);if(!isset($map[$path]))return;
        status_header(200);header('Content-Type: '.$map[$path][0]);header('Cache-Control: public, max-age=300, stale-while-revalidate=600');header('X-Robots-Tag: index, follow',false);echo $map[$path][1];exit;
    }

    public function filter_robots_txt($output,$public){
        if(!$public)return $output;
        $output.="\n# Zica Posts ".ZICA_POSTS_VERSION." discovery\n# RSS: ".$this->feed_url()."\nSitemap: ".home_url('/zica-ai-sitemap.xml')."\nSitemap: ".home_url('/wp-sitemap.xml')."\n";
        if('1'===(string)get_option('zica_posts_ai_crawlers_enabled','1'))foreach($this->ai_bots() as $bot)$output.="\nUser-agent: ".sanitize_text_field($bot)."\nAllow: /\n";
        return $output;
    }

    public function submit_indexnow_batch($urls,$batch_size=500){
        $urls=array_values(array_unique(array_filter((array)$urls)));if(!$urls)return array('submitted'=>0,'status'=>'nothing_to_submit');$key=(string)get_option('zica_posts_indexnow_key','');if(!$key)return array('submitted'=>0,'status'=>'missing_key');$host=wp_parse_url(home_url('/'),PHP_URL_HOST);$batch_size=min(10000,max(1,absint($batch_size)));$submitted=0;$responses=array();
        foreach(array_chunk(array_slice($urls,0,10000),$batch_size) as $batch){$safe=array();foreach($batch as $url){$url=esc_url_raw($url);if($url&&wp_parse_url($url,PHP_URL_HOST)===$host&&untrailingslashit($url)!==untrailingslashit($this->feed_url()))$safe[]=$url;}if(!$safe)continue;$response=wp_remote_post('https://api.indexnow.org/indexnow',array('timeout'=>15,'headers'=>array('Content-Type'=>'application/json; charset=utf-8'),'body'=>wp_json_encode(array('host'=>$host,'key'=>$key,'keyLocation'=>home_url('/'.$key.'.txt'),'urlList'=>$safe))));if(is_wp_error($response)){$responses[]=array('ok'=>false,'error'=>$response->get_error_message(),'count'=>count($safe));continue;}$code=wp_remote_retrieve_response_code($response);$ok=in_array($code,array(200,202),true);if($ok)$submitted+=count($safe);$responses[]=array('ok'=>$ok,'http'=>$code,'count'=>count($safe));}
        $result=array('submitted'=>$submitted,'requested'=>count($urls),'responses'=>$responses,'provider'=>'IndexNow','note'=>'canonical_content_urls_only_submission_received_not_indexing_confirmation');update_option('zica_posts_last_indexnow',array_merge($result,array('at'=>current_time('mysql',true))),false);return $result;
    }

    public function output_rss_alternate(){
        echo '<link rel="alternate" type="application/rss+xml" title="'.esc_attr(get_bloginfo('name').' RSS'). '" href="'.esc_url($this->feed_url()).'">'."\n";
    }

    public function output_schema(){
        if(!is_singular(array('post','page')))return;global $post;if(!$post instanceof WP_Post||'publish'!==$post->post_status)return;
        $stored=get_post_meta($post->ID,'_zica_posts_json_ld',true);if(is_array($stored)&&$stored){foreach($stored as $schema)if(is_array($schema))echo '<script type="application/ld+json">'.wp_json_encode($schema,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>'."\n";return;}if(defined('RANK_MATH_VERSION')||defined('WPSEO_VERSION'))return;
        $schema=array('@context'=>'https://schema.org','@type'=>'Article','headline'=>wp_strip_all_tags($post->post_title),'description'=>wp_strip_all_tags($post->post_excerpt?:wp_trim_words($post->post_content,35)),'url'=>get_permalink($post->ID),'datePublished'=>get_the_date('c',$post),'dateModified'=>get_the_modified_date('c',$post),'mainEntityOfPage'=>array('@type'=>'WebPage','@id'=>get_permalink($post->ID)),'author'=>array('@type'=>'Person','name'=>get_the_author_meta('display_name',$post->post_author)),'publisher'=>array('@type'=>'Organization','name'=>get_bloginfo('name'),'url'=>home_url('/')));$thumb=get_the_post_thumbnail_url($post->ID,'full');if($thumb)$schema['image']=$thumb;echo '<script type="application/ld+json">'.wp_json_encode($schema,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>'."\n";
    }

    public function output_datafeed_schema(){
        if(!(is_home()||is_front_page()||is_post_type_archive('post')))return;
        $elements=array();foreach(get_posts(array('post_type'=>'post','post_status'=>'publish','posts_per_page'=>20,'orderby'=>'date','order'=>'DESC')) as $post){$elements[]=array('@type'=>'DataFeedItem','dateCreated'=>get_the_date('c',$post),'item'=>array('@type'=>'NewsArticle','headline'=>wp_strip_all_tags($post->post_title),'url'=>get_permalink($post->ID)));}
        $schema=array('@context'=>'https://schema.org','@type'=>'DataFeed','name'=>get_bloginfo('name').' RSS','url'=>$this->feed_url(),'dateModified'=>$this->now_iso(),'dataFeedElement'=>$elements);
        echo '<script type="application/ld+json">'.wp_json_encode($schema,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>'."\n";
    }
}
