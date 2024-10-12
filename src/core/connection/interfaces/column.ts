
export interface Column {
    name: string;
    tableID: number;
    dataTypeID: number;
    dataType: string;
    label: string;
    required: boolean;
    visible: boolean
    order: number;
    length: number;
    precision: number;
    decimals: number;
    disabled: boolean;
    defaultValue: any;
    mask: string;
    filter: boolean;
    comment: string;
    component: string
    upperCase: boolean;
    unique: boolean;
    orderable: boolean;
    size: number;
    align: string;
    header: string;
    accessorKey: string;
    filterFn: string;
}
