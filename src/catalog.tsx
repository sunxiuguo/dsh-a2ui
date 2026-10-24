/*
 * TextField/Slider presentation and basic-theme behavior are adapted from
 * @a2ui/web_core 0.14.0, Copyright 2024 Google LLC, Apache License 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 * Changes: plugin-owned element, associated labels, native accessibility
 * attributes and validation descriptions. Vendor sources remain unchanged.
 */
import {css,html,nothing,type PropertyValues} from 'lit';
import {type Catalog} from '@a2ui/web_core/v0_9';
import {basicCatalog,TextFieldApi,SliderApi,isValidCssColor,computeColorVariant,injectBasicCatalogStyles} from '@a2ui/web_core/v0_9/basic_catalog';
import {A2uiLitElement,type WebComponentImplementation} from '@a2ui/web_core/v0_9/universal';
import type {ReactCatalogComponent} from '@a2ui/react/v0_9';

// Use the public universal-component base, not an internal BasicCatalog class
// or a React portal host. The official controller owns binding/check lifecycles.
let nextControlId=0;
class AccessibleTextFieldElement extends A2uiLitElement<typeof TextFieldApi>{
 protected readonly api=TextFieldApi;
 // Per rendered element, never a potentially repeated surface/component ID.
 private readonly controlId='dsh-a2ui-textfield-'+(++nextControlId);
 protected createRenderRoot(){return this;}
 connectedCallback(){super.connectedCallback();injectBasicCatalogStyles();}
 willUpdate(changed:PropertyValues){
  super.willUpdate(changed);
  const props=this.controller?.props;
  if(props?.weight!==undefined)this.style.flex=String(props.weight);
  else this.style.removeProperty('flex');
  const primary=this.context?.theme?.primaryColor;
  if(typeof primary==='string'&&isValidCssColor(primary)){
   this.style.setProperty('--a2ui-color-primary',primary);
   this.style.setProperty('--a2ui-color-primary-light',computeColorVariant('light',{colorVar:'--a2ui-color-primary'}));
   this.style.setProperty('--a2ui-color-primary-dark',computeColorVariant('dark',{colorVar:'--a2ui-color-primary'}));
   this.style.setProperty('--a2ui-color-primary-hover',computeColorVariant('hover',{darkVar:'--a2ui-color-primary-dark',lightVar:'--a2ui-color-primary-light'}));
  }else for(const name of ['--a2ui-color-primary','--a2ui-color-primary-light','--a2ui-color-primary-dark','--a2ui-color-primary-hover'])this.style.removeProperty(name);
  // These extra v0.9 attributes are preserved by the official binder as
  // literals, not newly interpreted as dynamic schema properties.
  const accessibility=props?.accessibility as typeof props.accessibility&{hidden?:boolean;live?:string};
  if(typeof accessibility?.hidden==='boolean')this.setAttribute('aria-hidden',String(accessibility.hidden));
  else this.removeAttribute('aria-hidden');
  if(accessibility?.live)this.setAttribute('aria-live',String(accessibility.live));
  else this.removeAttribute('aria-live');
 }
 render(){
  const props=this.controller?.props;if(!props)return nothing;
  const invalid=props.isValid===false;
  const errors=invalid?props.validationErrors??[]:[];
  const errorsId=this.controlId+'-errors',descriptionId=this.controlId+'-description';
  const description=props.accessibility?.description||'';
  const describedBy=[description?descriptionId:'',errors.length?errorsId:''].filter(Boolean).join(' ')||nothing;
  const onInput=(event:Event)=>props.setValue?.((event.target as HTMLInputElement).value);
  const classes='a2ui-textfield'+(invalid?' a2ui-invalid':'');
  // Explicit aria-label takes normal HTML precedence. The visible label stays
  // associated/clickable, and is the name when no explicit name is supplied.
  const name=props.accessibility?.label||nothing;
  return html`
   ${props.label?html`<label for=${this.controlId}>${props.label}</label>`:nothing}
   ${props.variant==='longText'?html`<textarea
    id=${this.controlId} class=${classes} .value=${props.value||''} @input=${onInput}
    aria-label=${name} aria-description=${description||nothing}
    aria-invalid=${invalid?'true':nothing} aria-describedby=${describedBy}
   ></textarea>`:html`<input
    id=${this.controlId} class=${classes} type=${props.variant==='number'?'number':props.variant==='obscured'?'password':'text'}
    .value=${props.value||''} @input=${onInput}
    aria-label=${name} aria-description=${description||nothing}
    aria-invalid=${invalid?'true':nothing} aria-describedby=${describedBy}
   />`}
   ${description?html`<span id=${descriptionId} hidden>${description}</span>`:nothing}
   ${errors.length?html`<div id=${errorsId}>${errors.map(message=>html`<div class="a2ui-error-message">${message}</div>`)}</div>`:nothing}
  `;
 }
 // The public base scopes/adopts these styles, including root-only fields.
 // No extracted CSS asset, global override, or vendor-node mutation is needed.
 static styles=css`
  :host{display:flex;flex-direction:column;width:var(--a2ui-textfield-width,100%);gap:var(--a2ui-spacing-xs,.25rem)}
  .a2ui-textfield{box-sizing:border-box;width:100%;background-color:var(--a2ui-color-input,#fff);color:var(--a2ui-color-on-input,#333);border:var(--a2ui-textfield-border,var(--a2ui-border));border-radius:var(--a2ui-textfield-border-radius,var(--a2ui-spacing-m));padding:var(--a2ui-textfield-padding,var(--a2ui-spacing-m));font-family:inherit}
  .a2ui-textfield:focus{outline:none;border-color:var(--a2ui-textfield-color-border-focus,var(--a2ui-color-primary,#17e))}
  .a2ui-textfield.a2ui-invalid{border-color:var(--a2ui-textfield-color-error,red)}
  label{font-size:var(--a2ui-textfield-label-font-size,var(--a2ui-label-font-size,var(--a2ui-font-size-s)));font-weight:var(--a2ui-textfield-label-font-weight,var(--a2ui-label-font-weight,bold))}
  .a2ui-error-message{color:var(--a2ui-textfield-color-error,red);font-size:var(--a2ui-font-size-xs,.75rem)}
 `;
}
const accessibleTextField:WebComponentImplementation<typeof TextFieldApi.schema>={
 ...TextFieldApi,tagName:'dsh-a2ui-textfield',element:AccessibleTextFieldElement,
};
class AccessibleSliderElement extends A2uiLitElement<typeof SliderApi>{
 protected readonly api=SliderApi;
 private readonly controlId='dsh-a2ui-slider-'+(++nextControlId);
 protected createRenderRoot(){return this;}
 connectedCallback(){super.connectedCallback();injectBasicCatalogStyles();}
 willUpdate(changed:PropertyValues){
  super.willUpdate(changed);
  const props=this.controller?.props;
  if(props?.weight!==undefined)this.style.flex=String(props.weight);
  else this.style.removeProperty('flex');
  const primary=this.context?.theme?.primaryColor;
  if(typeof primary==='string'&&isValidCssColor(primary)){
   this.style.setProperty('--a2ui-color-primary',primary);
   this.style.setProperty('--a2ui-color-primary-light',computeColorVariant('light',{colorVar:'--a2ui-color-primary'}));
   this.style.setProperty('--a2ui-color-primary-dark',computeColorVariant('dark',{colorVar:'--a2ui-color-primary'}));
   this.style.setProperty('--a2ui-color-primary-hover',computeColorVariant('hover',{darkVar:'--a2ui-color-primary-dark',lightVar:'--a2ui-color-primary-light'}));
  }else for(const name of ['--a2ui-color-primary','--a2ui-color-primary-light','--a2ui-color-primary-dark','--a2ui-color-primary-hover'])this.style.removeProperty(name);
  // These extra v0.9 attributes are preserved by the official binder as
  // literals, not newly interpreted as dynamic schema properties.
  const accessibility=props?.accessibility as typeof props.accessibility&{hidden?:boolean;live?:string};
  if(typeof accessibility?.hidden==='boolean')this.setAttribute('aria-hidden',String(accessibility.hidden));
  else this.removeAttribute('aria-hidden');
  if(accessibility?.live)this.setAttribute('aria-live',String(accessibility.live));
  else this.removeAttribute('aria-live');
 }
 render(){
  const props=this.controller?.props;if(!props)return nothing;
  const invalid=props.isValid===false;
  const errors=invalid?props.validationErrors??[]:[];
  const errorsId=this.controlId+'-errors',descriptionId=this.controlId+'-description';
  const description=props.accessibility?.description||'';
  const describedBy=[description?descriptionId:'',errors.length?errorsId:''].filter(Boolean).join(' ')||nothing;
  // v0.9/v0.9.1 has neither step nor steps. Keep the official native default
  // increment (1); do not import v1 semantics or rewrite authored model data.
  return html`
   <div class="a2ui-slider-container">
    <div class="a2ui-slider-header">
     ${props.label?html`<label class="a2ui-slider-label" for=${this.controlId}>${props.label}</label>`:nothing}
     <span class="a2ui-slider-value">${props.value}</span>
    </div>
    <input id=${this.controlId} class="a2ui-slider" type="range"
     min=${props.min??0} max=${props.max??100} .value=${props.value?.toString()||'0'}
     @input=${(event:Event)=>props.setValue?.(Number((event.target as HTMLInputElement).value))}
     aria-label=${props.accessibility?.label||nothing} aria-description=${description||nothing}
     aria-invalid=${invalid?'true':nothing} aria-describedby=${describedBy}
    />
    ${description?html`<span id=${descriptionId} hidden>${description}</span>`:nothing}
    ${errors.length?html`<div id=${errorsId}>${errors.map(message=>html`<div class="a2ui-error-message">${message}</div>`)}</div>`:nothing}
   </div>
  `;
 }
 static styles=css`
  .a2ui-slider-container{width:100%;display:flex;flex-direction:column;gap:var(--a2ui-spacing-xs,4px);margin:var(--a2ui-slider-margin,var(--a2ui-spacing-m,16px))}
  .a2ui-slider-header{display:flex;justify-content:space-between;font-size:var(--a2ui-slider-label-font-size,var(--a2ui-label-font-size,var(--a2ui-font-size-s,14px)));font-weight:var(--a2ui-slider-label-font-weight,bold);color:var(--a2ui-text-color-text,var(--a2ui-color-on-background,#333))}
  .a2ui-slider{width:100%;cursor:pointer;accent-color:var(--a2ui-slider-thumb-color,var(--a2ui-color-primary,#007bff));background:var(--a2ui-slider-track-color,var(--a2ui-color-secondary,#e9ecef))}
  .a2ui-error-message{color:var(--a2ui-slider-color-error,red);font-size:var(--a2ui-font-size-xs,.75rem)}
 `;
}
const accessibleSlider:WebComponentImplementation<typeof SliderApi.schema>={
 ...SliderApi,tagName:'dsh-a2ui-slider',element:AccessibleSliderElement,
};
// Official immutable extension API: retain the published catalog document and
// every other component/function; replace only TextField/Slider implementations.
const catalog:Catalog<ReactCatalogComponent>=basicCatalog;
export const rendererCatalog=catalog.withEntries(
 [...catalog.components.values()].map(component=>component.name==='TextField'?accessibleTextField:component.name==='Slider'?accessibleSlider:component),
 [...catalog.functions.values()],
);
