import React from 'react';
import { render } from 'react-dom';
import isFun from '../../lib/utils/isFun';
import log from '../../lib/utils/log';
import clusterIcon from '../../lib/assets/map_cluster.png';
import {
  MarkerAllProps,
  getPropValue,
} from '../../lib/utils/markerUtils';

require('../../lib/assets/marker.css');

const Component = React.Component;

const SCALE = 0.8;
const SIZE_WIDTH = 32 * SCALE;
const SIZE_HEIGHT = 46 * SCALE - 2;
const SIZE_HOVER_WIDTH = 46 * SCALE;
const SIZE_HOVER_HEIGHT = 66 * SCALE - 2;
const MAX_INFO_MARKERS = 42;


const defaultOpts = {
  useCluster: false,
  markersCache: [],
  markerIDCache: [],
};

const IdKey = '__react_amap__';

/*
 * props
 * {
 *  useCluster(boolean)是否使用聚合点
 *  markers(array<>)坐标列表
 *  __map__ 父级组件传过来的地图实例
 *  __ele__ 父级组件传过来的地图容器
 *
 * }
 */

class Markers extends Component {
  constructor(props) {
    super(props);
    if (!props.__map__) {
      log.warning('MAP_INSTANCE_REQUIRED');
    } else {
      this.map = props.__map__;
      this.element = props.__ele__;
      this.markersCache = defaultOpts.markersCache;
      this.useCluster = null;
      this.markerIDCache = defaultOpts.markerIDCache;
      this.resetOffset = new window.AMap.Pixel(- SIZE_WIDTH / 2, - SIZE_HEIGHT);
      this.hoverOffset = new window.AMap.Pixel(- SIZE_HOVER_WIDTH / 2, - SIZE_HOVER_HEIGHT);
      this.createMarkers(props);
    }
  }
  
  shouldComponentUpdate(){
    return false;
  }
  
  createMarkers(props) {
    const markers = props.markers || [];
    let renderFn;
    if (isFun(props.render)) {
      renderFn = props.render;
    }
    const mapMarkers = [];
    const markerReactChildDOM = {};
    markers.length && markers.forEach((raw, idx) => {
      const options = this.buildCreateOptions(props, raw, idx);
      options.map = this.map;
      
      let markerContent = null;
      if (isFun(props.render)) {
        let markerChild = props.render.call(null, raw, idx);
        if (markerChild !== false) {
          const div = document.createElement('div');
          div.setAttribute(IdKey, '1');
          markerContent = div;
          markerReactChildDOM[idx] = markerChild;
        }
      }
      
      if (!markerContent){
        markerContent = document.createElement('div');
        const img = document.createElement('img');
        img.src = '//webapi.amap.com/theme/v1.3/markers/n/mark_bs.png';
        markerContent.appendChild(img);
      }
      options.content = markerContent;
  
      const marker = new window.AMap.Marker(options);
      marker.on('click', (e) => { this.onMarkerClick(e); });
      marker.on('mouseover', (e) => { this.onMarkerHover(e); });
      marker.on('mouseout', (e) => { this.onMarkerHoverOut(e); });
  
      this.bindMarkerEvents(marker);
      mapMarkers.push(marker);
    });
    this.markersCache = mapMarkers;
    this.markerReactChildDOM = markerReactChildDOM;
    this.exposeMarkerInstance();
  
    this.checkClusterSettings(props);
  }
  
  checkClusterSettings(props){
    let useCluster = defaultOpts.useCluster;
    if (typeof props.useCluster === 'boolean') {
      useCluster = props.useCluster;
    }
    
    if (useCluster) {
      this.loadClusterPlugin().then((cluster) => {
        cluster.setMarkers(this.markersCache);
      });
    } else {
      if (this.mapCluster) {
        const markers = this.mapCluster.getMarkers();
        this.mapCluster.clearMarkers();
        markers.forEach((marker) => {
          marker.setMap(this.map);
        });
      }
    }
  }
  
  componentDidMount() {
    if (this.map) {
      this.setMarkerChild(this.props);
    }
  }
  
  setMarkerChild(props){
    Object.keys(this.markerReactChildDOM).forEach((idx) => {
      const dom = this.markersCache[idx].getContent();
      const child = this.markerReactChildDOM[idx];
      this.renderMarkerChild(dom, child);
    })
  }
  
  renderMarkerChild(dom, child){
    render(<div>{child}</div>, dom);
  }
  
  buildCreateOptions(props, raw, idx){
    const result = {};
    // 强制用户通过 render 函数来定义外观
    // const disabledKeys = ['label', 'icon', 'content'];
    // 还是不强制好，通过覆盖的方式来(如果有 render，覆盖 content/icon);
    const disabledKeys = ['extData'];
    MarkerAllProps.forEach((key) => {
      if ((key in raw) && (disabledKeys.indexOf(key) === -1)) {
        result[key] = getPropValue(key, raw[key]);
      } else if(key in props) {
        if (isFun(props[key])) {
          const tmpValue = props[key].call(null, raw, idx);
          result[key] = getPropValue(key, tmpValue);
        } else {
          result[key] = getPropValue(key, props[key]);
        }
      }
    });
    result.extData = raw;
    return result;
  }
  
  componentWillReceiveProps(nextProps) {
    if (this.map) {
      this.refreshMarkersLayout(nextProps);
    }
  }
  
  refreshMarkersLayout(nextProps){
    const markerChanged = (nextProps.markers !== this.props.markers);
    if (markerChanged) {
      this.createMarkers(nextProps);
      this.setMarkerChild(this.props);
    }
    if(markerChanged || (nextProps.useCluster !== this.props.useCluster)) {
      if (this.markersWindow) {
        this.markersWindow.close();
      }
    }
    this.checkClusterSettings(nextProps);
  }
  
  loadClusterPlugin(){
    if(this.mapCluster) {
      return new Promise((resolve) => {
        resolve(this.mapCluster);
      })
    }
    return new Promise((resolve) => {
      this.map.plugin(['AMap.MarkerClusterer'], () => {
        resolve(this.createClusterPlugin());
      });
    })
  }
  
  
  createClusterPlugin(){
    const style = {
      url: clusterIcon,
      size: new window.AMap.Size(56, 56),
      offset: new window.AMap.Pixel(-28, -28),
    };
    const clusterStyles = [style, style, style];
    this.mapCluster = new window.AMap.MarkerClusterer(this.map, [], {
      minClusterSize: 2,
      zoomOnClick: false,
      gridSize: 60,
      styles: clusterStyles,
      averageCenter: true,
    });
    this.initClusterMarkerWindow();
    this.bindClusterEvent();
    return this.mapCluster;
  }
  
  onMarkerClick(e) {
    const marker = e.target;
    this.triggerMarkerClick(e, marker);
  }
  
  onMarkerHover(e) {
    e.target.setTop(true);
    this.setMarkerHovered(e, e.target);
  }
  
  onMarkerHoverOut(e) {
    e.target.setTop(false);
    this.setMarkerHoverOut(e, e.target);
  }
  
  onWindowMarkerClick(element) {
    const marker = element.markerRef;
    this.triggerMarkerClick(null, marker);
  }
  
  onWindowMarkerHover(element) {
    const marker = element.markerRef;
    this.setMarkerHovered(null, marker);
  }
  
  onWindowMarkerHoverOut(element) {
    const marker = element.markerRef;
    this.setMarkerHoverOut(null, marker);
  }
  
  setMarkerHovered(e, marker) {
    this.triggerMarkerHover(e, marker);
  }
  
  setMarkerHoverOut(e, marker) {
    this.triggerMarkerHoverOut(e, marker);
  }
  
  triggerMarkerClick(e, marker) {
    // const raw = marker.getExtData();
    const events = this.props.events || {};
    if (isFun(events.click)) {
      events.click(e, marker);
    }
  }
  
  triggerMarkerHover(e, marker) {
    // const raw = marker.getExtData();
    const events = this.props.events || {};
    if (isFun(events.mouseover)) {
      events.mouseover(e, marker);
    }
  }
  
  triggerMarkerHoverOut(e, marker) {
    // const raw = marker.getExtData();
    const events = this.props.events || {};
    if (isFun(events.mouseout)) {
      events.mouseout(e, marker);
    }
  }
  
  initClusterMarkerWindow() {
    this.markersWindow = new window.AMap.InfoWindow({
      isCustom: true,
      autoMove: true,
      closeWhenClickMap: true,
      content: '<span>loading...</span>',
      showShadow: false,
      offset: new window.AMap.Pixel(0, -20),
    });
    this.markersDOM = document.createElement('div');
    this.markersDOM.className = 'amap_markers_pop_window';
    this.markersWindow.setContent(this.markersDOM);
  }
  
  bindClusterEvent() {
    this.mapCluster.on('click', (e) => {
      this.showMarkersInfoWindow(e);
    });
  }
  
  showMarkersInfoWindow(e) {
    const pos = e.lnglat;
    let markers = e.markers;
    this.markersDOM.innerHTML = '';
    if (markers && markers.length) {
      const length = markers.length;
      if (length > MAX_INFO_MARKERS) {
        markers = markers.slice(0, MAX_INFO_MARKERS);
      }
      markers.forEach((m) => {
        const contentDOM = m.getContent();
        const itemDOM = document.createElement('div');
        itemDOM.className = 'window_marker_item';
        itemDOM.appendChild(contentDOM);
        itemDOM.markerRef = m;
  
        itemDOM.addEventListener('click', this.onWindowMarkerClick.bind(this, itemDOM), true);
        itemDOM.addEventListener('mouseover', this.onWindowMarkerHover.bind(this, itemDOM), true);
        itemDOM.addEventListener('mouseout', this.onWindowMarkerHoverOut.bind(this, itemDOM), true);
        
        this.markersDOM.appendChild(itemDOM);
        
      });
      if (length > MAX_INFO_MARKERS) {
        const warning = document.createElement('div');
        warning.className = 'amap_markers_window_overflow_warning';
        warning.innerText = '更多坐标请放大地图查看';
        this.markersDOM.appendChild(warning);
      }
    }
    this.markersWindow.open(this.map, pos);
  }
  
  exposeMarkerInstance() {
    if ('events' in this.props) {
      const events = this.props.events || {};
      if (isFun(events.created)) {
        events.created(this.markersCache);
      }
    }
  }
  
  bindMarkerEvents(marker) {
    const events = this.props.events || {};
    const list = Object.keys(events);
    const preserveEv = ['click', 'mouseover', 'mouseout', 'created'];
    list.length && list.forEach((evName) => {
      if (preserveEv.indexOf(evName) === -1) {
        marker.on(evName, events[evName]);
      }
    });
  }
  
  render() {
    return (null);
  }
}

export default Markers;