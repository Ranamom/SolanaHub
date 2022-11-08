import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-select-item',
  templateUrl: './select-item.component.html',
  styleUrls: ['./select-item.component.scss'],
})
export class SelectItemComponent implements OnChanges {
  @Input() item: any;
  @Input() searchTerm: string = '';
  @Input() isDropDownOpen: boolean = false;
  @Input() showDropDownIcon: boolean = false;
  @Output() onSelect = new EventEmitter();
  constructor() { }

  ngOnChanges(changes): void {
    //Called before any other lifecycle hook. Use it to inject dependencies, but avoid any serious work here.
    //Add '${implements OnChanges}' to the class.
    // console.log(this.item)
  }
  public onSelectItem(item){
    console.log(item)
    if(!item?.selectable){
      return
    }else{
      console.log('emit')
      this.onSelect.emit(item)
    }
  }
}
